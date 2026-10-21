#!/usr/bin/env python3
"""
scripts/run_whisper_gpu.py
High-performance CUDA ASR transcription runner for NVIDIA GB10 GPU.
Runs directly within the Docker container with native CUDA int8 acceleration.
"""

import os, sys, json, time
from pathlib import Path
from faster_whisper import WhisperModel

# T2：模型可設定；預設完整 large-v3（turbo 僅 4 層解碼器，佛學名相誤聽多），WHISPER_MODEL=turbo 路徑可作快速模式
MODEL_PATH = os.environ.get("WHISPER_MODEL", "large-v3")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "float16")
VAD_MIN_SILENCE_MS = int(os.environ.get("WHISPER_VAD_MIN_SILENCE_MS", "900"))

BUDDHIST_INITIAL_PROMPT = (
    "以下是見悲青增格西講授《入中論善顯密意疏》的開示錄音。包含專有名相：見悲青增格西、月稱菩薩、宗喀巴大師、"
    "中觀應成派、自續派、唯識、經部、有部、世俗諦、勝義諦、二諦、無自性、中觀應成、"
    "阿賴耶識、空性、現觀、菩提心、見行、遮遣、所破、因明量論、名言有、勝義無、七相推求。"
)


def resolve_prompt(page_range):
    if not page_range:
        return BUDDHIST_INITIAL_PROMPT
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from lib.session_prompt import build_initial_prompt
        return build_initial_prompt(page_range)
    except Exception:
        return BUDDHIST_INITIAL_PROMPT

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 run_whisper_gpu.py <audio_path> [language] [out_json_path] [page_range e.g. p.111]")
        sys.exit(1)

    audio_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "none" else "zh"
    out_json = sys.argv[3] if len(sys.argv) > 3 else None
    page_range = sys.argv[4] if len(sys.argv) > 4 else ""
    prompt = resolve_prompt(page_range)

    t0 = time.perf_counter()
    model = WhisperModel(MODEL_PATH, device="cuda", compute_type=COMPUTE_TYPE)

    segments, info = model.transcribe(
        audio_path,
        language=language,
        beam_size=5,
        patience=1.2,
        initial_prompt=prompt,
        repetition_penalty=1.08,
        condition_on_previous_text=False,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=VAD_MIN_SILENCE_MS, speech_pad_ms=400)
    )
    results = []
    prev_end = 0.0
    for s in segments:
        text = s.text.strip()
        if not text:
            continue
        start = max(round(s.start, 3), prev_end)
        end = max(round(s.end, 3), start + 0.3)
        results.append({
            "start": start,
            "end": end,
            "text": text,
            "words": [{"start": w.start, "end": w.end, "word": w.word,
                       "probability": w.probability} for w in s.words or []]
        })
        prev_end = end

    elapsed = time.perf_counter() - t0
    payload = {
        "duration": info.duration,
        "language": info.language,
        "elapsed_seconds": round(elapsed, 3),
        "rtf": round(elapsed / max(info.duration, 1e-5), 4),
        "total_segments": len(results),
        "segments": results
    }

    if out_json:
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(f"✅ Transcribed {len(results)} segments in {elapsed:.2f}s (RTF: {payload['rtf']}) -> {out_json}")
    else:
        print(json.dumps(payload, ensure_ascii=False))

if __name__ == "__main__":
    main()
