#!/usr/bin/env python3
"""Stage 0 baseline snapshot for sessions 01/69A/110B.

Records:
  - source MP3 path, resolved real path, size, ffprobe duration, sha256
  - session JSON sha256, paragraph count, last end timestamp
  - max timestamp > audio duration (anomaly detection)
  - first + last sentence of each session
"""
import hashlib, json, os, subprocess
from pathlib import Path

ROOT = Path("courses/入中論善顯密意疏")
SESSIONS = [("01", "session_01.json"),
            ("69A", "session_69A.json"),
            ("110B", "session_110B.json")]

def sha256_file(p):
    h = hashlib.sha256(); h.update(p.read_bytes()); return h.hexdigest()

def ffprobe_duration(p):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(p)],
        capture_output=True, text=True, timeout=10,
    )
    return float(out.stdout.strip()) if out.returncode == 0 else None

def resolve_symlink(p):
    """Resolve a symlink (or path) to its real target path object."""
    if p.is_symlink():
        return Path(os.readlink(str(p)))
    return p

report = {"tool": "scripts/stage0_baseline.py", "stages": []}

for sid, sjson in SESSIONS:
    audio = Path(f"audio/{sid}.mp3")
    audio_real = resolve_symlink(audio)
    if not audio_real.exists():
        audio_real = audio
    audio_sha = sha256_file(audio_real) if audio_real.exists() else None
    audio_dur = ffprobe_duration(audio_real) if audio_real.exists() else None

    js = ROOT / "sessions" / sjson
    js_sha = sha256_file(js)
    d = json.loads(js.read_text())
    paras = d["paragraphs"]
    last_end = paras[-1]["end"]
    over_dur = (audio_dur is not None) and (last_end > audio_dur + 1.0)
    first_s = paras[0]["sentences"][0]
    last_s = paras[-1]["sentences"][-1]

    report["stages"].append({
        "sessionId": sid,
        "audio_relpath": str(audio),
        "audio_realpath": str(audio_real),
        "audio_size_bytes": audio_real.stat().st_size if audio_real.exists() else None,
        "audio_duration_seconds": audio_dur,
        "audio_sha256": audio_sha,
        "session_json_path": str(js),
        "session_json_sha256": js_sha,
        "paragraph_count": len(paras),
        "session_json_last_end": last_end,
        "last_end_exceeds_audio_duration": over_dur,
        "first_sentence": first_s,
        "last_sentence": last_s,
    })

out = Path("qa_27B/stage0_baseline.json")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(f"Wrote {out}")
for s in report["stages"]:
    print(f"\n--- session {s['sessionId']} ---")
    print(f"audio: {s['audio_realpath']}")
    print(f"  dur={s['audio_duration_seconds']:.2f}s sha256={s['audio_sha256'][:16]}...")
    print(f"json: paras={s['paragraph_count']} last_end={s['session_json_last_end']} sha256={s['session_json_sha256'][:16]}...")
    print(f"  last_end > audio_dur? {s['last_end_exceeds_audio_duration']}")