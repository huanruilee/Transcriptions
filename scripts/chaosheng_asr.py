#!/usr/bin/env python3
"""
scripts/chaosheng_asr.py

《朝聖前行課程》（2026 印度朝聖前行課程，如性法師）本機 ASR 時間碼權威。

形狀：`scripts/sifayin_asr.py` 的 chunked 版（單次整檔請求會在 3600 s 逾時回 0 bytes）。

  原始 mp3（/home/henry/.gx10/projects/chaosheng-qianxing-2026/audio/CSQX_0N.mp3）
    → ffmpeg 切 600 s chunk（-reset_timestamps 1，chunk 內時間從 0 起算）
    → 逐 chunk 送 whisper-gpu-service（/v1/audio/transcriptions, verbose_json）
    → 段內時間 + chunks.csv 的 start_time = 全域時間
    → reviews/evidence/朝聖前行課程/lecture_0N/raw_asr.json（原樣保存，不覆寫）

防呆：
  * 音檔 sha256 與 notes/audio-sha256.txt 不符 → 中止
  * 三層時間驗證（逐 chunk ffprobe vs csv < 0.5 s；chunk_000 起點 = 0；Σffprobe vs 整檔 < 2 s）
  * tailGapSec > 15 s → 明確回報尾段缺漏
  * 逐 chunk 快取（work/asr_cache/<sid>/chunk_XXX.json）→ 可續跑、不重打 GPU
"""

import argparse
import csv
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
COURSE_DIR = BASE / "courses" / "朝聖前行課程"
EVIDENCE = BASE / "reviews" / "evidence" / "朝聖前行課程"
WORK = EVIDENCE / "work"
CHUNK_ROOT = WORK / "chunks"
CACHE_ROOT = WORK / "asr_cache"

PROJECT = Path("/home/henry/.gx10/projects/chaosheng-qianxing-2026")
AUDIO_DIR = PROJECT / "audio"
SHA_FILE = PROJECT / "notes" / "audio-sha256.txt"

WHISPER_URL = os.environ.get("WHISPER_GPU_URL", "http://127.0.0.1:8010/v1/audio/transcriptions")
SEGMENT_SECONDS = 600
CHUNK_MAX_TIME = 1800  # 單 chunk 10 分鐘，RTF 再差也不該超過 30 分鐘

INITIAL_PROMPT = (
    "以下是如性法師《朝聖前行：從歡喜欲見到依教奉行》的課程錄音，"
    "內容談朝聖、佛陀四大聖地與八大聖地、歡喜欲見、憶念不忘、生戀慕心、"
    "因果、四諦、無我、七支、菩提心、迴向。請用繁體中文轉寫，使用全形標點。"
)

EXPECTED_DURATION = {
    "01": 5265.144, "02": 5137.560, "03": 5831.088,
    "04": 5019.168, "05": 3776.544, "06": 6635.760,
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_expected_sha() -> dict:
    expected = {}
    for line in SHA_FILE.read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) == 2:
            expected[Path(parts[1]).name] = parts[0]
    return expected


def ffprobe_duration(path: Path) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)], text=True)
    return round(float(out.strip()), 3)


def split_chunks(mp3: Path, session_id: str) -> list:
    out_dir = CHUNK_ROOT / f"lecture_{session_id}"
    csv_path = out_dir / "chunks.csv"
    if csv_path.exists():
        rows = read_chunks_csv(csv_path)
        if rows and all((out_dir / r["file"]).exists() for r in rows):
            return rows
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob("chunk_*.mp3"):
        stale.unlink()
    subprocess.check_call([
        "ffmpeg", "-v", "error", "-y", "-i", str(mp3),
        "-f", "segment", "-segment_time", str(SEGMENT_SECONDS),
        "-c", "copy", "-reset_timestamps", "1",
        "-segment_list", str(csv_path), "-segment_list_type", "csv",
        str(out_dir / "chunk_%03d.mp3"),
    ])
    return read_chunks_csv(csv_path)


def read_chunks_csv(csv_path: Path) -> list:
    rows = []
    with open(csv_path, newline="", encoding="utf-8") as fh:
        for row in csv.reader(fh):
            if len(row) < 3:
                continue
            rows.append({
                "file": Path(row[0]).name,
                "start": round(float(row[1]), 3),
                "end": round(float(row[2]), 3),
            })
    return rows


def transcribe_chunk(chunk: Path, cache: Path) -> dict:
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    cmd = [
        "curl", "--max-time", str(CHUNK_MAX_TIME), "-sS", "-X", "POST", WHISPER_URL,
        "-F", f"file=@{chunk}",
        "-F", "language=zh",
        "-F", "response_format=verbose_json",
        "-F", "beam_size=10",
        "-F", "temperature=0",
        "-F", "vad_filter=true",
        "-F", "condition_on_previous_text=true",
        "-F", f"initial_prompt={INITIAL_PROMPT}",
    ]
    last_error = None
    for attempt in (1, 2, 3):
        try:
            raw = subprocess.check_output(cmd, text=True)
            data = json.loads(raw)
            if data.get("segments") is not None:
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
                return data
            last_error = RuntimeError(f"whisper returned no segments: {raw[:300]}")
        except subprocess.CalledProcessError as err:
            last_error = err
        print(f"[asr] {chunk.name}: attempt {attempt} failed ({last_error}); retrying", flush=True)
        time.sleep(5 * attempt)
    raise last_error


def run_session(session_id: str, limit_chunks: int = 0, dry_run: bool = False) -> dict:
    mp3 = AUDIO_DIR / f"CSQX_{session_id}.mp3"
    if not mp3.exists():
        raise SystemExit(f"缺音檔：{mp3}")

    expected_sha = load_expected_sha().get(mp3.name)
    actual_sha = sha256_file(mp3)
    if expected_sha and actual_sha != expected_sha:
        raise SystemExit(f"CSQX_{session_id} sha256 與 notes/audio-sha256.txt 不符 → 中止")

    duration = ffprobe_duration(mp3)
    expected_duration = EXPECTED_DURATION.get(session_id)
    if expected_duration and abs(duration - expected_duration) > 1.0:
        print(f"[asr] ⚠️ CSQX_{session_id} duration {duration} 與預期 {expected_duration} 差 > 1 s",
              flush=True)

    chunks = split_chunks(mp3, session_id)
    chunk_dir = CHUNK_ROOT / f"lecture_{session_id}"
    cache_dir = CACHE_ROOT / f"lecture_{session_id}"

    # ── 三層時間驗證 ──────────────────────────────────────────────────────
    offsets = []
    probe_sum = 0.0
    for index, row in enumerate(chunks):
        path = chunk_dir / row["file"]
        measured = ffprobe_duration(path)
        probe_sum += measured
        csv_duration = round(row["end"] - row["start"], 3)
        if abs(measured - csv_duration) > 0.5:
            raise SystemExit(
                f"[asr] 時間驗證失敗：{row['file']} ffprobe={measured} vs csv={csv_duration} 差 > 0.5 s")
        if index == 0 and abs(row["start"]) > 0.001:
            raise SystemExit(f"[asr] 時間驗證失敗：chunk_000 起點 {row['start']} ≠ 0")
        offsets.append({"file": row["file"], "csvStart": row["start"],
                        "ffprobeDuration": measured})
    if abs(probe_sum - duration) > 2.0:
        raise SystemExit(f"[asr] 時間驗證失敗：Σchunk={probe_sum:.3f} vs 整檔={duration} 差 > 2 s")

    print(f"[asr] {session_id}: {len(chunks)} chunks, audio={duration}s, Σchunk={probe_sum:.3f}s",
          flush=True)

    if dry_run:
        return {"sessionId": session_id, "chunks": len(chunks), "duration": duration,
                "chunkOffsets": offsets, "dryRun": True}

    started = time.time()
    segments = []
    next_id = 1
    rtf_samples = []
    model_name = None
    todo = chunks[:limit_chunks] if limit_chunks else chunks
    for index, row in enumerate(todo):
        path = chunk_dir / row["file"]
        data = transcribe_chunk(path, cache_dir / f"chunk_{index:03d}.json")
        if model_name is None:
            model_name = data.get("model") or "faster-whisper-large-v3-turbo"
        if data.get("rtf"):
            rtf_samples.append(round(float(data["rtf"]), 4))
        offset = row["start"]
        for seg in data.get("segments", []):
            text = (seg.get("text") or "").strip()
            if not text:
                continue
            segments.append({
                "id": next_id,
                "start": round(offset + float(seg["start"]), 3),
                "end": round(offset + float(seg["end"]), 3),
                "text": text,
            })
            next_id += 1
        print(f"[asr] {session_id}: chunk {index + 1}/{len(todo)} "
              f"segs={len(segments)} rtf={data.get('rtf')}", flush=True)

    elapsed = round(time.time() - started, 2)
    last_end = segments[-1]["end"] if segments else 0.0
    tail_gap = round(duration - last_end, 2)

    # VAD 會把唱誦（如開經偈三稱）判為非語音而整段跳過 → 明確記錄長缺口，
    # 供人工回聽，不假裝已轉寫。
    long_gaps = []
    cursor = 0.0
    for seg in segments:
        if seg["start"] - cursor > 20:
            long_gaps.append({"afterSegmentId": seg["id"] - 1 if seg["id"] > 1 else None,
                              "start": round(cursor, 2), "end": seg["start"],
                              "durationSec": round(seg["start"] - cursor, 2)})
        cursor = max(cursor, seg["end"])
    if duration - cursor > 20:
        long_gaps.append({"afterSegmentId": segments[-1]["id"] if segments else None,
                          "start": round(cursor, 2), "end": duration,
                          "durationSec": round(duration - cursor, 2)})

    artifact = {
        "schema": "chaosheng-raw-asr/v1",
        "sessionId": session_id,
        "audio": str(mp3),
        "audioSha256": actual_sha,
        "audioDurationSec": duration,
        "model": model_name,
        "endpoint": WHISPER_URL,
        "params": {
            "language": "zh",
            "beam_size": 10,
            "temperature": 0,
            "vad_filter": True,
            "condition_on_previous_text": True,
            "initial_prompt": INITIAL_PROMPT,
            "chunkSeconds": SEGMENT_SECONDS,
        },
        "chunks": len(chunks),
        "chunksTranscribed": len(todo),
        "transcribeElapsedSec": elapsed,
        "realtimeFactor": round(elapsed / duration, 5) if duration else None,
        "chunkRtfSamples": rtf_samples,
        "tailGapSec": tail_gap,
        "longGaps": long_gaps,
        "segmentCount": len(segments),
        "charCount": sum(len(s["text"]) for s in segments),
        "segmentIdType": "integer",
        "_meta": {"chunkOffsets": offsets},
        "segments": segments,
    }

    out_path = EVIDENCE / f"lecture_{session_id}" / "raw_asr.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists() and not limit_chunks:
        backup = out_path.with_suffix(".prev.json")
        backup.write_text(out_path.read_text(encoding="utf-8"), encoding="utf-8")
    out_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    ratio = artifact["charCount"] / duration if duration else 0
    print(f"[asr] {session_id}: {len(segments)} segs, {artifact['charCount']} chars, "
          f"ratio={ratio:.3f} char/s, tailGap={tail_gap}s, elapsed={elapsed}s → {out_path}",
          flush=True)
    if tail_gap > 15:
        print(f"[asr] ⚠️ {session_id} 尾段缺口 {tail_gap}s > 15 s，需回報", flush=True)
    return artifact


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sessions", required=True, help="逗號分隔 sessionId，如 01,02")
    parser.add_argument("--limit-chunks", type=int, default=0, help="只跑前 N 個 chunk（量 RTF）")
    parser.add_argument("--dry-run", action="store_true", help="只切 chunk 並做時間驗證")
    args = parser.parse_args()

    wanted = [s.strip() for s in args.sessions.split(",") if s.strip()]
    for session_id in wanted:
        run_session(session_id, limit_chunks=args.limit_chunks, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
