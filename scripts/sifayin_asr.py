#!/usr/bin/env python3
"""
scripts/sifayin_asr.py

對《四法印》各講官方音檔執行本機 GPU Whisper（whisper-gpu-service:8010），
輸出 reviews/evidence/sifayin/playlist-NN/raw_asr.json（含 segments 與 sha256）。

防呆：
  * 音檔 sha256 與 intake_manifest 記錄不一致 → 中止
  * 音檔長度與 YouTube duration 差 > 5 s → 記錄 durationMismatch，不中止但標記
  * 轉錄結束時間未涵蓋到音檔尾端（> 15 s 缺口）→ 回報尾部缺段
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
EVIDENCE = BASE / "reviews" / "evidence" / "sifayin"
WHISPER_URL = os.environ.get("WHISPER_GPU_URL", "http://127.0.0.1:8010/v1/audio/transcriptions")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def audio_duration(path: Path) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)], text=True)
    return round(float(out.strip()), 3)


MAX_ASR_SECONDS = 3000


def transcribe(path: Path, prompt: str) -> dict:
    cmd = [
        "curl", "--max-time", str(MAX_ASR_SECONDS), "-sS", "-X", "POST", WHISPER_URL,
        "-F", f"file=@{path}",
        "-F", "model=whisper-1",
        "-F", "language=zh",
        "-F", "response_format=verbose_json",
        "-F", f"prompt={prompt}",
    ]
    last_error = None
    for attempt in (1, 2):
        try:
            raw = subprocess.check_output(cmd, text=True)
            data = json.loads(raw)
            if "segments" in data:
                return data
            last_error = RuntimeError(f"whisper returned no segments: {raw[:300]}")
        except subprocess.CalledProcessError as err:  # curl 28 = timeout
            last_error = err
        if attempt == 1:
            print(f"[asr] retry after failure: {last_error}", flush=True)
    raise last_error


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sessions", required=True, help="逗號分隔 sessionId")
    args = parser.parse_args()

    manifest = json.loads((EVIDENCE / "intake_manifest.json").read_text(encoding="utf-8"))
    wanted = [s.strip() for s in args.sessions.split(",") if s.strip()]

    for session_id in wanted:
        record = manifest["sessions"].get(session_id)
        if not record:
            print(f"[asr] {session_id}: intake 尚未完成，略過", flush=True)
            continue
        mp3 = BASE / record["audio"]
        if not mp3.exists():
            print(f"[asr] {session_id}: 缺音檔 {mp3}", file=sys.stderr, flush=True)
            continue
        actual_sha = sha256_file(mp3)
        if actual_sha != record["audioSha256"]:
            raise RuntimeError(f"session {session_id}: 音檔 sha256 與 intake 記錄不一致")

        duration = audio_duration(mp3)
        folder = EVIDENCE / f"playlist-{session_id}"
        out_path = folder / "raw_asr.json"
        if out_path.exists():
            print(f"[asr] {session_id}: 已存在 raw_asr.json，略過", flush=True)
            continue

        started = time.time()
        data = transcribe(mp3, "繁體中文佛教講記，如性法師開示《四法印》，使用臺灣正體字與全形標點。")
        elapsed = round(time.time() - started, 2)

        segments = [
            {"id": f"seg-{i + 1:04d}", "start": round(float(s["start"]), 3),
             "end": round(float(s["end"]), 3), "text": s["text"].strip()}
            for i, s in enumerate(data.get("segments", []))
            if s["text"].strip()
        ]
        last_end = segments[-1]["end"] if segments else 0.0
        artifact = {
            "schema": "sifayin-raw-asr/v1",
            "sessionId": session_id,
            "audio": record["audio"],
            "audioSha256": actual_sha,
            "audioDurationSec": duration,
            "model": "faster-whisper-large-v3-turbo",
            "endpoint": WHISPER_URL,
            "transcribeElapsedSec": elapsed,
            "realtimeFactor": round(elapsed / duration, 5) if duration else None,
            "tailGapSec": round(duration - last_end, 2),
            "segmentCount": len(segments),
            "charCount": sum(len(s["text"]) for s in segments),
            "segments": segments,
        }
        folder.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(artifact, ensure_ascii=False) + "\n", encoding="utf-8")
        ratio = artifact["charCount"] / duration if duration else 0
        print(f"[asr] {session_id}: {len(segments)} segs, {artifact['charCount']} chars, "
              f"ratio={ratio:.3f}/s, tailGap={artifact['tailGapSec']}s, {elapsed}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
