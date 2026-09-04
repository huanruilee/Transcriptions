#!/usr/bin/env python3
"""
scripts/benchmark_whisper_params.py
A/B Benchmark script comparing Baseline vs. Optimized Whisper ASR decoding parameters.
Uses standard library urllib to avoid third-party dependencies.
"""

import sys, os, time, json
import urllib.request
import urllib.error
import mimetypes

DEFAULT_URLS = [
    os.environ.get("WHISPER_GPU_URL"),
    "http://127.0.0.1:8010/v1/audio/transcriptions",
    "http://100.113.144.100:8010/v1/audio/transcriptions"
]

BUDDHIST_WHISPER_INITIAL_PROMPT = (
    "以下是見悲青增格西講授《入中論善顯密意疏》的開示錄音。包含專有名相：見悲青增格西、月稱菩薩、宗喀巴大師、"
    "中觀應成派、自續派、唯識、經部、有部、世俗諦、勝義諦、二諦、無自性、中觀應成、"
    "阿賴耶識、空性、現觀、菩提心、見行、遮遣、所破、因明量論、名言有、勝義無、七相推求。"
)

def find_active_endpoint():
    for url in DEFAULT_URLS:
        if not url:
            continue
        try:
            health_url = url.replace("/v1/audio/transcriptions", "/health")
            req = urllib.request.Request(health_url)
            with urllib.request.urlopen(req, timeout=3) as resp:
                if resp.status == 200:
                    return url
        except Exception:
            continue
    return None

def transcribe(endpoint, audio_path, data_fields):
    boundary = f"----WebKitFormBoundary{int(time.time()*1000)}"
    body_parts = []

    # Text fields
    for k, v in data_fields.items():
        body_parts.append(f"--{boundary}\r\n".encode("utf-8"))
        body_parts.append(f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode("utf-8"))
        body_parts.append(f"{v}\r\n".encode("utf-8"))

    # File field
    filename = os.path.basename(audio_path)
    body_parts.append(f"--{boundary}\r\n".encode("utf-8"))
    body_parts.append(f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode("utf-8"))
    body_parts.append(b"Content-Type: audio/mpeg\r\n\r\n")
    with open(audio_path, "rb") as f:
        body_parts.append(f.read())
    body_parts.append(f"\r\n--{boundary}--\r\n".encode("utf-8"))

    payload = b"".join(body_parts)

    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )

    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=120) as resp:
        res_bytes = resp.read()
    elapsed = time.perf_counter() - t0

    res = json.loads(res_bytes.decode("utf-8"))
    res["client_elapsed_s"] = round(elapsed, 3)
    return res

def main():
    audio_file = sys.argv[1] if len(sys.argv) > 1 else "audio_bench/sample_27b.mp3"
    if not os.path.exists(audio_file):
        print(f"Error: audio file {audio_file} not found.")
        sys.exit(1)

    endpoint = find_active_endpoint()
    if not endpoint:
        print("Error: No active Whisper GPU service found on localhost or Tailscale.")
        sys.exit(1)

    print(f"🎙️ Running Whisper A/B Benchmark against: {endpoint}")
    print(f"🎵 Audio Sample: {audio_file}")

    # 1. Baseline Run
    print("\n--- Running Baseline (beam_size=1, no prompt) ---")
    data_baseline = {
        "language": "zh",
        "response_format": "verbose_json",
        "beam_size": "1"
    }
    res_baseline = transcribe(endpoint, audio_file, data_baseline)
    text_baseline = " ".join(s["text"] for s in res_baseline.get("segments", []))
    rtf_baseline = res_baseline.get("rtf", 0)

    # 2. Optimized Run
    print("\n--- Running Optimized (beam_size=5, initial_prompt, tuned VAD, anti-repetition) ---")
    data_opt = {
        "language": "zh",
        "response_format": "verbose_json",
        "beam_size": "5",
        "initial_prompt": BUDDHIST_WHISPER_INITIAL_PROMPT,
        "patience": "1.2",
        "repetition_penalty": "1.08",
        "condition_on_previous_text": "false",
        "vad_min_silence_duration_ms": "600",
        "vad_speech_pad_ms": "400"
    }
    res_opt = transcribe(endpoint, audio_file, data_opt)
    text_opt = " ".join(s["text"] for s in res_opt.get("segments", []))
    rtf_opt = res_opt.get("rtf", 0)

    print("\n" + "="*80)
    print("📊 A/B BENCHMARK RESULTS SUMMARY")
    print("="*80)
    print(f"| Metric | Baseline | Optimized |")
    print(f"| :--- | :--- | :--- |")
    print(f"| Audio Duration | {res_baseline.get('duration', 0):.2f}s | {res_opt.get('duration', 0):.2f}s |")
    print(f"| Elapsed Time | {res_baseline['client_elapsed_s']:.2f}s | {res_opt['client_elapsed_s']:.2f}s |")
    print(f"| Realtime Factor (RTF) | {rtf_baseline:.4f} (~{1/max(rtf_baseline, 1e-4):.1f}x) | {rtf_opt:.4f} (~{1/max(rtf_opt, 1e-4):.1f}x) |")
    print(f"| Segment Count | {len(res_baseline.get('segments', []))} | {len(res_opt.get('segments', []))} |")
    print(f"| Character Count | {len(text_baseline)} | {len(text_opt)} |")
    print("="*80)

    print("\n[Baseline Output Preview]:")
    print(text_baseline[:350] + ("..." if len(text_baseline) > 350 else ""))
    print("\n[Optimized Output Preview]:")
    print(text_opt[:350] + ("..." if len(text_opt) > 350 else ""))

if __name__ == "__main__":
    main()
