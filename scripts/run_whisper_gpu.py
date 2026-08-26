#!/usr/bin/env python3
"""
scripts/run_whisper_gpu.py
High-performance CUDA ASR transcription runner for NVIDIA GB10 GPU.
Runs directly within the Docker container with native CUDA int8 acceleration.
"""

import sys, json, time
from pathlib import Path
from faster_whisper import WhisperModel

MODEL_PATH = "/root/.cache/huggingface/hub/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo/snapshots/0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf"

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 run_whisper_gpu.py <audio_path> [language] [out_json_path]")
        sys.exit(1)

    audio_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "none" else "zh"
    out_json = sys.argv[3] if len(sys.argv) > 3 else None

    t0 = time.perf_counter()
    model = WhisperModel(MODEL_PATH, device="cuda", compute_type="int8")

    segments, info = model.transcribe(audio_path, language=language, beam_size=1)
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
            "text": text
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
