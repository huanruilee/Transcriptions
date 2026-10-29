#!/usr/bin/env python3
"""S2 ASR for 三主要道 playlist-01.

Two independent passes for cross-calibration of the chars/second coefficient:
  A) full-file ASR (primary)
  B) 150s-window ASR (secondary, same engine + same params)

Both use the GPU whisper service at 127.0.0.1:8010 with the server-side path
form (the container mounts the repo read-only at /workspace).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

WORK = Path("/home/henry/.gx10/xiaofa/workspace/Transcriptions/.work/sanzhuyaodao/01")
ENDPOINT = "http://127.0.0.1:8010/v1/audio/transcriptions"
CONTAINER_ROOT = "/workspace/.work/sanzhuyaodao/01"

PARAMS = {
    "language": "zh",
    "task": "transcribe",
    "response_format": "verbose_json",
    "beam_size": "10",
    "temperature": "0",
    "vad_filter": "true",
    "no_speech_threshold": "0.6",
    # condition_on_previous_text is deliberately left at the server default
    # (true).  Turning it off corrupts Buddhist terminology (緣起性空 -> 緣起信空).
    "condition_on_previous_text": "true",
    "vad_min_silence_duration_ms": "500",
    "vad_speech_pad_ms": "200",
}


def post(path_on_host: str, label: str) -> dict:
    container_path = CONTAINER_ROOT + "/" + path_on_host
    body = "&".join(f"{k}={urllib.parse.quote(v)}" for k, v in PARAMS.items())
    body += f"&file={urllib.parse.quote(container_path)}"
    req = urllib.request.Request(
        ENDPOINT,
        data=body.encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    t0 = time.perf_counter()
    last: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=3600) as resp:
                payload = json.load(resp)
            break
        except Exception as error:  # noqa: BLE001
            last = error
            print(f"[{label}] attempt {attempt + 1} failed: {error}", flush=True)
            time.sleep(3 * (attempt + 1))
    else:
        raise last if last else RuntimeError(f"{label}: unknown ASR failure")
    wall = time.perf_counter() - t0
    payload["_wall_seconds"] = round(wall, 3)
    payload["_label"] = label
    payload["_source_path"] = path_on_host
    return payload


def main() -> None:
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    results = {}

    if which in ("all", "full"):
        print("[full] POST full source.mp3", flush=True)
        results["full"] = post("source.mp3", "full")
        (WORK / "raw_asr_full.json").write_text(
            json.dumps(results["full"], ensure_ascii=False, indent=2), encoding="utf-8"
        )
        seg = results["full"].get("segments", [])
        chars = sum(len(s.get("text", "")) for s in seg)
        dur = results["full"].get("duration", 0)
        print(
            f"[full] segments={len(seg)} chars={chars} duration={dur} "
            f"chars_per_sec={chars / max(dur, 1e-6):.4f} "
            f"rtf={results['full'].get('rtf')} wall={results['full']['_wall_seconds']}",
            flush=True,
        )

    if which in ("all", "chunks"):
        chunk_dir = WORK / "chunks150"
        files = sorted(chunk_dir.glob("c_*.mp3"))
        print(f"[chunks] {len(files)} chunks", flush=True)
        chunk_results = []
        for index, file in enumerate(files):
            payload = post(f"chunks150/{file.name}", file.stem)
            seg = payload.get("segments", [])
            chars = sum(len(s.get("text", "")) for s in seg)
            chunk_results.append({
                "chunk": file.name,
                "segments": len(seg),
                "chars": chars,
                "duration": payload.get("duration"),
                "rtf": payload.get("rtf"),
                "wall": payload["_wall_seconds"],
                "_segment_list": seg,
            })
            print(
                f"[chunks] {index + 1}/{len(files)} {file.name} seg={len(seg)} chars={chars}",
                flush=True,
            )
        (WORK / "raw_asr_chunks150.json").write_text(
            json.dumps(chunk_results, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (WORK / "raw_asr_chunks150_segments.json").write_text(
            json.dumps(
                {"chunks": [
                    {"chunk": p["chunk"], "segments": p.get("_segment_list", [])}
                    for p in chunk_results
                ]},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        total_chars = sum(c["chars"] for c in chunk_results)
        total_dur = sum(c["duration"] or 0 for c in chunk_results)
        print(
            f"[chunks] total chars={total_chars} duration={total_dur} "
            f"chars_per_sec={total_chars / max(total_dur, 1e-6):.4f}",
            flush=True,
        )


if __name__ == "__main__":
    import urllib.parse  # noqa: E402  (used inside post)

    main()
