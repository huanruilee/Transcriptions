#!/usr/bin/env python3
"""
scripts/build_pramana2_course_registry.py

Populate courses/釋量論第二品/audio_map.json and course.json sessions[] from the
YouTube playlist (PLMngxNMnjFcPb9_mZSX2f7i1E9JbC_AGI, 32 lectures, 如性法師).

Video metadata is read from a manifest JSON produced by yt-dlp:
  yt-dlp --flat-playlist -J PLAYLIST > pramana2_playlist.json
Usage: python3 scripts/build_pramana2_course_registry.py <playlist.json>
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COURSE_DIR = ROOT / "courses" / "釋量論第二品"
PLAYLIST_ID = "PLMngxNMnjFcPb9_mZSX2f7i1E9JbC_AGI"
TITLE_RE = re.compile(r"^釋量論第二品\s+32-(\d+)\s+(.+)$")

def main(manifest_path):
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    entries = manifest.get("entries") or []
    videos = {}
    for e in entries:
        m = TITLE_RE.match((e.get("title") or "").strip())
        if not m:
            continue
        num = int(m.group(1))
        videos[num] = {
            "videoId": e["id"],
            "topic": m.group(2).strip(),
            "duration": e.get("duration"),
        }
    assert len(videos) == 32, f"expected 32 lectures in manifest, got {len(videos)}"

    # audio_map.json: sessionId -> YouTube watch URL
    audio_map = {f"{n:02d}": f"https://www.youtube.com/watch?v={v['videoId']}" for n, v in sorted(videos.items())}
    (COURSE_DIR / "audio_map.json").write_text(json.dumps(audio_map, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # course.json: keep meta, fill sessions[]
    course_path = COURSE_DIR / "course.json"
    course = json.loads(course_path.read_text(encoding="utf-8"))
    sessions = []
    for n, v in sorted(videos.items()):
        sid = f"{n:02d}"
        sessions.append({
            "sessionId": sid,
            "sessionNum": n,
            "subSession": "",
            "periodLabel": "",
            "date": "",
            "pageRange": "",
            "title": f"第 {n} 講 | {v['topic']}",
            "audioUrl": f"https://www.youtube.com/watch?v={v['videoId']}",
            "jsonUrl": f"courses/釋量論第二品/sessions/session_{sid}.json",
            "summary": "",
            "duration": v["duration"],
        })
    course["sessions"] = sessions
    course_path.write_text(json.dumps(course, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: audio_map.json + course.json registered {len(sessions)} sessions")

if __name__ == "__main__":
    main(sys.argv[1])
