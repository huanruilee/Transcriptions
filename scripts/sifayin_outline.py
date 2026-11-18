#!/usr/bin/env python3
"""
scripts/sifayin_outline.py

讀取《四法印》各講 YouTube 描述中的「課程提綱」（附時間碼），正規化為
reviews/evidence/sifayin/playlist-NN/outline.json：
    {"session": "02", "title": "...", "sections": [{"index":1,"heading":"...","startSec":0}, ...]}

時間碼是切段的唯一依據（比照三主要道 S5）；未取到提綱的講次會明確回報，
不得以猜測的小標補洞。
"""

import json
import re
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
EVIDENCE = BASE / "reviews" / "evidence" / "sifayin"

SESSIONS = [
    ("01", "dAyrtR6hQik"),
    ("02", "tLSvZzazrbM"),
    ("03", "SPovYO1r4ss"),
    ("04", "BdOVte3o6kc"),
    ("05", "FARWbQZPAcw"),
    ("06", "oCQU-3ggipM"),
    ("07", "LQjIiEGKjH0"),
    ("08", "ucXdxJYUO8s"),
    ("09", "bAuJq_T43S4"),
    ("10", "11gEibLNGTM"),
    ("11", "s8hZpRQm9BY"),
]

OUTLINE_RE = re.compile(r"^\s*(\d{1,2})\s*[\.、．]\s*(.+?)\s*[（(]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[)）]\s*$")


def fetch_description(video_id: str) -> str:
    return subprocess.check_output(
        ["yt-dlp", "--no-update", "--skip-download", "--print", "%(description)s",
         f"https://youtu.be/{video_id}"],
        text=True, stderr=subprocess.DEVNULL,
    )


def parse_outline(description: str):
    sections = []
    for line in description.splitlines():
        match = OUTLINE_RE.match(line)
        if not match:
            continue
        index, heading, minute, second, hour = match.groups()
        seconds = int(second) + int(minute) * 60 + (int(hour) * 3600 if hour else 0)
        heading = re.sub(r"\s+", "", heading)
        if not heading:
            continue
        if sections and seconds <= sections[-1]["startSec"]:
            continue  # 同一提綱重複出現（年度不同版本）時只取第一段
        sections.append({"index": int(index), "heading": heading, "startSec": seconds})
    return sections


def main() -> int:
    failed = []
    for session_id, video_id in SESSIONS:
        folder = EVIDENCE / f"playlist-{session_id}"
        folder.mkdir(parents=True, exist_ok=True)
        description = fetch_description(video_id)
        (folder / "description.txt").write_text(description, encoding="utf-8")
        sections = parse_outline(description)
        title_match = re.search(r"^\s*(四法印[^\n]*|法師的教學藍圖與建議)", description, re.M)
        payload = {
            "schema": "sifayin-outline/v1",
            "session": session_id,
            "youtubeVideoId": video_id,
            "source": f"https://www.youtube.com/watch?v={video_id}",
            "outlineSource": "youtube-description",
            "sections": sections,
        }
        (folder / "outline.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"[outline] {session_id}: {len(sections)} sections", flush=True)
        if not sections:
            failed.append(session_id)
    if failed:
        print(f"[outline] MISSING: {','.join(failed)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
