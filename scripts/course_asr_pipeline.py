#!/usr/bin/env python3
"""
scripts/course_asr_pipeline.py

通用新課程本機 Whisper ASR 時間碼管線（抽離自 chaosheng_asr.py / sifayin_asr.py）。

流程：
  原始音檔（mp3/m4a/wav，預設依檔名數字排序對應 01..NN）
    → SHA-256 驗證（可選 --sha-file / --write-sha）
    → ffmpeg 切 600 s chunk（-reset_timestamps 1，chunk 內時間從 0 起算）
    → 三層時間驗證（逐 chunk ffprobe vs csv < 0.5 s；chunk_000 起點 = 0；Σffprobe vs 整檔 < 2 s）
    → 逐 chunk 送 whisper-gpu-service（/v1/audio/transcriptions, verbose_json）
    → 逐 chunk 快取（reviews/evidence/<課程名>/work/asr_cache/<sid>/chunk_XXX.json）
    → 輸出 reviews/evidence/<課程名>/lecture_<sid>/raw_asr.json（原樣保存，不覆寫）
"""

import argparse
import csv
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
AUDIO_EXTS = {".mp3", ".m4a", ".wav", ".flac", ".ogg", ".opus"}
DEFAULT_WHISPER_URL = os.environ.get(
    "WHISPER_GPU_URL", "http://127.0.0.1:8010/v1/audio/transcriptions"
)
DEFAULT_SEGMENT_SECONDS = 600
CHUNK_MAX_TIME = 1800


def natural_sort_key(path: Path) -> tuple:
    """Sort audio filenames naturally so lecture 2 precedes lecture 10."""
    parts = re.split(r"(\d+)", path.name)
    return tuple((0, int(p)) if p.isdigit() else (1, p.lower()) for p in parts)


def discover_audio_files(audio_dir: Path, sessions_filter: list[str] | None = None) -> dict[str, Path]:
    """Map two-digit session IDs ('01'..'NN') to audio files sorted naturally."""
    if not audio_dir.is_dir():
        raise SystemExit(f"音檔目錄不存在：{audio_dir}")
    files = sorted(
        (p for p in audio_dir.iterdir() if p.is_file() and p.suffix.lower() in AUDIO_EXTS),
        key=natural_sort_key,
    )
    if not files:
        raise SystemExit(f"音檔目錄內找不到音訊檔：{audio_dir}")

    mapping = {f"{idx:02d}": path for idx, path in enumerate(files, 1)}
    if sessions_filter:
        selected = {}
        for sid in sessions_filter:
            norm = sid.zfill(2) if sid.isdigit() else sid
            if norm not in mapping:
                raise SystemExit(f"找不到講次 {norm} 對應音檔（共有 {len(files)} 檔）")
            selected[norm] = mapping[norm]
        return selected
    return mapping


def sha256_file(path: Path) -> str:
    """Compute SHA-256 hex digest of a file using 1 MiB chunks."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_expected_sha(sha_file: Path | None) -> dict[str, str]:
    """Load '<sha256>  <filename>' manifest if provided and present."""
    if not sha_file or not sha_file.exists():
        return {}
    expected: dict[str, str] = {}
    for line in sha_file.read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) >= 2 and re.fullmatch(r"[0-9a-fA-F]{64}", parts[0]):
            expected[Path(parts[1]).name] = parts[0].lower()
    return expected


def write_sha_manifest(sha_file: Path, audio_map: dict[str, Path]) -> None:
    """Write SHA-256 manifest for all mapped audio files."""
    sha_file.parent.mkdir(parents=True, exist_ok=True)
    lines = [f"{sha256_file(path)}  {path.name}" for _, path in sorted(audio_map.items())]
    sha_file.write_text("\n".join(lines) + "\n", encoding="utf-8")


def ffprobe_duration(path: Path) -> float:
    """Return rounded duration in seconds from ffprobe."""
    out = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        text=True,
    )
    return round(float(out.strip()), 3)


def read_chunks_csv(csv_path: Path) -> list[dict]:
    """Parse ffmpeg segment list CSV into chunk metadata dicts."""
    rows = []
    with open(csv_path, newline="", encoding="utf-8") as fh:
        for row in csv.reader(fh):
            if len(row) < 3:
                continue
            rows.append(
                {
                    "file": Path(row[0]).name,
                    "start": round(float(row[1]), 3),
                    "end": round(float(row[2]), 3),
                }
            )
    return rows


def split_chunks(audio_path: Path, chunk_dir: Path, segment_seconds: int) -> list[dict]:
    """Split audio into fixed-duration chunks with reset timestamps."""
    csv_path = chunk_dir / "chunks.csv"
    if csv_path.exists():
        rows = read_chunks_csv(csv_path)
        if rows and all((chunk_dir / r["file"]).exists() for r in rows):
            return rows
    chunk_dir.mkdir(parents=True, exist_ok=True)
    for stale in chunk_dir.glob("chunk_*"):
        stale.unlink()
    ext = audio_path.suffix.lower() or ".mp3"
    subprocess.check_call(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            str(audio_path),
            "-f",
            "segment",
            "-segment_time",
            str(segment_seconds),
            "-c",
            "copy",
            "-reset_timestamps",
            "1",
            "-segment_list",
            str(csv_path),
            "-segment_list_type",
            "csv",
            str(chunk_dir / f"chunk_%03d{ext}"),
        ]
    )
    return read_chunks_csv(csv_path)


def verify_chunk_timing(
    chunks: list[dict], chunk_dir: Path, total_duration: float, probe_fn=ffprobe_duration
) -> tuple[list[dict], float]:
    """Enforce three-layer timing invariants before ASR."""
    if not chunks:
        raise SystemExit("[asr] 時間驗證失敗：chunks 清單為空")
    offsets = []
    probe_sum = 0.0
    for index, row in enumerate(chunks):
        measured = probe_fn(chunk_dir / row["file"])
        probe_sum += measured
        csv_duration = round(row["end"] - row["start"], 3)
        if abs(measured - csv_duration) > 0.5:
            raise SystemExit(
                f"[asr] 時間驗證失敗：{row['file']} ffprobe={measured} vs csv={csv_duration} 差 > 0.5 s"
            )
        if index == 0 and abs(row["start"]) > 0.001:
            raise SystemExit(f"[asr] 時間驗證失敗：chunk_000 起點 {row['start']} != 0")
        offsets.append({"file": row["file"], "csvStart": row["start"], "ffprobeDuration": measured})
    if abs(probe_sum - total_duration) > 2.0:
        raise SystemExit(f"[asr] 時間驗證失敗：Σchunk={probe_sum:.3f} vs 整檔={total_duration} 差 > 2 s")
    return offsets, round(probe_sum, 3)


def transcribe_chunk(chunk: Path, cache: Path, whisper_url: str, initial_prompt: str) -> dict:
    """Call whisper-gpu-service with 3 retries and per-chunk disk cache."""
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    cmd = [
        "curl",
        "--max-time",
        str(CHUNK_MAX_TIME),
        "-sS",
        "-X",
        "POST",
        whisper_url,
        "-F",
        f"file=@{chunk}",
        "-F",
        "language=zh",
        "-F",
        "response_format=verbose_json",
        "-F",
        "beam_size=10",
        "-F",
        "temperature=0",
        "-F",
        "vad_filter=true",
        "-F",
        "condition_on_previous_text=true",
    ]
    if initial_prompt:
        cmd.extend(["-F", f"initial_prompt={initial_prompt}"])

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


def detect_gaps_and_non_speech(segments: list[dict], duration: float) -> tuple[list[dict], list[dict]]:
    """Flag >20s VAD skips and long-duration/short-text chanting spans."""
    long_gaps = []
    cursor = 0.0
    for seg in segments:
        if seg["start"] - cursor > 20:
            long_gaps.append(
                {
                    "afterSegmentId": seg["id"] - 1 if seg["id"] > 1 else None,
                    "start": round(cursor, 2),
                    "end": seg["start"],
                    "durationSec": round(seg["start"] - cursor, 2),
                }
            )
        cursor = max(cursor, seg["end"])
    if duration - cursor > 20:
        long_gaps.append(
            {
                "afterSegmentId": segments[-1]["id"] if segments else None,
                "start": round(cursor, 2),
                "end": duration,
                "durationSec": round(duration - cursor, 2),
            }
        )

    suspected_non_speech = []
    for seg in segments:
        span = seg["end"] - seg["start"]
        if span > 20 and len(seg["text"]) < 12:
            suspected_non_speech.append(
                {
                    "segmentId": seg["id"],
                    "start": round(seg["start"], 2),
                    "end": round(seg["end"], 2),
                    "durationSec": round(span, 2),
                    "text": seg["text"],
                    "note": "長時段卻只有極短文字：疑似唱誦／非語音段被 VAD 壓縮，需人工回聽",
                }
            )
    return long_gaps, suspected_non_speech


def run_session(
    course: str,
    session_id: str,
    audio_path: Path,
    expected_sha: str | None,
    whisper_url: str,
    initial_prompt: str,
    segment_seconds: int,
    limit_chunks: int = 0,
    dry_run: bool = False,
) -> dict:
    """Run SHA verification, chunking, timing check, and optional ASR for one session."""
    actual_sha = sha256_file(audio_path)
    if expected_sha and actual_sha != expected_sha.lower():
        raise SystemExit(
            f"[asr] {audio_path.name} sha256 ({actual_sha[:12]}) 與 manifest ({expected_sha[:12]}) 不符 → 中止"
        )

    if dry_run:
        return {
            "sessionId": session_id,
            "audio": str(audio_path),
            "audioName": audio_path.name,
            "audioSha256": actual_sha,
            "dryRun": True,
        }

    evidence = BASE / "reviews" / "evidence" / course
    chunk_dir = evidence / "work" / "chunks" / f"lecture_{session_id}"
    cache_dir = evidence / "work" / "asr_cache" / f"lecture_{session_id}"

    duration = ffprobe_duration(audio_path)
    chunks = split_chunks(audio_path, chunk_dir, segment_seconds)
    offsets, probe_sum = verify_chunk_timing(chunks, chunk_dir, duration)
    print(f"[asr] {session_id}: {len(chunks)} chunks, audio={duration}s, Σchunk={probe_sum:.3f}s", flush=True)

    started = time.time()
    segments = []
    next_id = 1
    rtf_samples = []
    model_name = None
    todo = chunks[:limit_chunks] if limit_chunks else chunks
    for index, row in enumerate(todo):
        path = chunk_dir / row["file"]
        data = transcribe_chunk(path, cache_dir / f"chunk_{index:03d}.json", whisper_url, initial_prompt)
        if model_name is None:
            model_name = data.get("model") or "faster-whisper-large-v3-turbo"
        if data.get("rtf"):
            rtf_samples.append(round(float(data["rtf"]), 4))
        offset = row["start"]
        for seg in data.get("segments", []):
            text = (seg.get("text") or "").strip()
            if not text:
                continue
            segments.append(
                {
                    "id": next_id,
                    "start": round(offset + float(seg["start"]), 3),
                    "end": round(offset + float(seg["end"]), 3),
                    "text": text,
                }
            )
            next_id += 1
        print(f"[asr] {session_id}: chunk {index + 1}/{len(todo)} segs={len(segments)} rtf={data.get('rtf')}", flush=True)

    elapsed = round(time.time() - started, 2)
    last_end = segments[-1]["end"] if segments else 0.0
    tail_gap = round(duration - last_end, 2)
    long_gaps, suspected_non_speech = detect_gaps_and_non_speech(segments, duration)

    artifact = {
        "schema": "course-raw-asr/v1",
        "course": course,
        "sessionId": session_id,
        "audio": str(audio_path),
        "audioSha256": actual_sha,
        "audioDurationSec": duration,
        "model": model_name,
        "endpoint": whisper_url,
        "params": {
            "language": "zh",
            "beam_size": 10,
            "temperature": 0,
            "vad_filter": True,
            "condition_on_previous_text": True,
            "initial_prompt": initial_prompt,
            "chunkSeconds": segment_seconds,
        },
        "chunks": len(chunks),
        "chunksTranscribed": len(todo),
        "transcribeElapsedSec": elapsed,
        "realtimeFactor": round(elapsed / duration, 5) if duration else None,
        "chunkRtfSamples": rtf_samples,
        "tailGapSec": tail_gap,
        "longGaps": long_gaps,
        "suspectedNonSpeechSpans": suspected_non_speech,
        "segmentCount": len(segments),
        "charCount": sum(len(s["text"]) for s in segments),
        "segmentIdType": "integer",
        "_meta": {"chunkOffsets": offsets},
        "segments": segments,
    }

    out_path = evidence / f"lecture_{session_id}" / "raw_asr.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists() and not limit_chunks:
        out_path.with_suffix(".prev.json").write_text(out_path.read_text(encoding="utf-8"), encoding="utf-8")
    out_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    ratio = artifact["charCount"] / duration if duration else 0
    print(
        f"[asr] {session_id}: {len(segments)} segs, {artifact['charCount']} chars, "
        f"ratio={ratio:.3f} char/s, tailGap={tail_gap}s, elapsed={elapsed}s → {out_path}",
        flush=True,
    )
    if tail_gap > 15:
        print(f"[asr] ⚠️ {session_id} 尾段缺口 {tail_gap}s > 15 s，需回報", flush=True)
    return artifact


def main() -> int:
    parser = argparse.ArgumentParser(description="通用新課程本機 Whisper ASR 時間碼管線")
    parser.add_argument("--course", required=True, help="courses/<課程名> 目錄名稱")
    parser.add_argument("--audio-dir", required=True, help="音檔目錄路徑")
    parser.add_argument("--sessions", default="", help="逗號分隔 sessionId，預設全部依自然排序對應 01..NN")
    parser.add_argument("--sha-file", default="", help="SHA-256 清單檔路徑（格式：<sha>  <檔名>）")
    parser.add_argument("--write-sha", action="store_true", help="計算並寫入 --sha-file 後繼續")
    parser.add_argument("--initial-prompt", default="", help="傳給 Whisper 的行內 initial_prompt")
    parser.add_argument("--segment-seconds", type=int, default=DEFAULT_SEGMENT_SECONDS)
    parser.add_argument("--whisper-url", default=DEFAULT_WHISPER_URL)
    parser.add_argument("--limit-chunks", type=int, default=0, help="只跑前 N 個 chunk（量 RTF）")
    parser.add_argument("--dry-run", action="store_true", help="只驗證音檔對應與 SHA-256，不切檔或呼叫 GPU")
    parser.add_argument("--json", action="store_true", help="以 JSON 輸出摘要")
    args = parser.parse_args()

    wanted = [s.strip() for s in args.sessions.split(",") if s.strip()] or None
    audio_map = discover_audio_files(Path(args.audio_dir), wanted)
    sha_path = Path(args.sha_file) if args.sha_file else None
    if args.write_sha:
        if not sha_path:
            raise SystemExit("--write-sha 必須同時指定 --sha-file")
        write_sha_manifest(sha_path, audio_map)

    expected_shas = load_expected_sha(sha_path)
    results = []
    for sid, audio_path in audio_map.items():
        res = run_session(
            course=args.course,
            session_id=sid,
            audio_path=audio_path,
            expected_sha=expected_shas.get(audio_path.name),
            whisper_url=args.whisper_url,
            initial_prompt=args.initial_prompt,
            segment_seconds=args.segment_seconds,
            limit_chunks=args.limit_chunks,
            dry_run=args.dry_run,
        )
        results.append(res)

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
