#!/usr/bin/env python3
"""
scripts/build_pusa_course.py

由 YouTube 播放清單建立／更新《菩薩就是這樣成佛》（智善法師）課程骨架：
  - courses/菩薩就是這樣成佛/course.json   （已有逐字稿的講次放 sessions，其餘放 pendingSessions）
  - courses/菩薩就是這樣成佛/toc.json      （依標題頁碼分組的科判初稿，保留逐講 sections）
  - courses/catalog.json                    （登錄課程）

可重複執行：以影片 ID 去重；已存在於 sessions 的講次不會被覆蓋。
不可用（隱藏／私有）的影片不編號、不補洞，只在 course.json 記錄 unavailableVideoIds。

用法：
    python3 scripts/build_pusa_course.py            # 以 yt-dlp 讀取播放清單
    python3 scripts/build_pusa_course.py --offline playlist.json   # 使用已存的 yt-dlp -J 輸出
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
COURSE_ID = "pusa-jiu-shi-zhe-yang-cheng-fo"
COURSE_TITLE = "菩薩就是這樣成佛"
MASTER = "智善法師"
CHANNEL = "高雄法印講堂"
CHANNEL_ID = "UC0pSF-Xaes-K1oh2zrxvUsg"
PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLLGhqdv1W4OE"
COURSE_DIR = BASE_DIR / "courses" / COURSE_TITLE
CATALOG = BASE_DIR / "courses" / "catalog.json"

TITLE_RE = re.compile(r"菩薩就是這樣成佛\s*\(智善法師\)\s*(\d{1,3})\s*[:：]?\s*(.*)$")
PAGE_RE = re.compile(r"p\.?\s*(\d+)(?:\s*[-–~]\s*(\d+))?", re.IGNORECASE)


def fetch_playlist(offline):
    if offline:
        return json.loads(Path(offline).read_text(encoding="utf-8"))
    out = subprocess.check_output(
        ["yt-dlp", "--no-update", "-J", "--flat-playlist", PLAYLIST_URL],
        stderr=subprocess.DEVNULL,
    )
    return json.loads(out)


def parse_entry(entry):
    """回傳 (number, pageStart, pageEnd, topic)；無法解析編號時回傳 None。"""
    title = entry.get("title") or ""
    m = TITLE_RE.search(title)
    if not m:
        return None
    number = int(m.group(1))
    rest = m.group(2).strip()
    page_start = page_end = None
    pm = PAGE_RE.search(rest)
    if pm:
        page_start = int(pm.group(1))
        page_end = int(pm.group(2)) if pm.group(2) else page_start
        rest = (rest[: pm.start()] + rest[pm.end():]).strip()
    topic = rest.strip(" 、，,:：")
    return number, page_start, page_end, topic


def page_label(start, end):
    if start is None:
        return ""
    return f"p.{start}" if start == end else f"p.{start}-{end}"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--offline", help="已存的 yt-dlp -J --flat-playlist JSON")
    args = ap.parse_args()

    data = fetch_playlist(args.offline)
    available, unavailable, unparsed = [], [], []
    for entry in data.get("entries", []):
        vid = entry.get("id")
        title = entry.get("title")
        if not title or title in ("[Private video]", "[Deleted video]"):
            unavailable.append(vid)
            continue
        parsed = parse_entry(entry)
        if not parsed:
            unparsed.append((vid, title))
            continue
        number, ps, pe, topic = parsed
        available.append({
            "number": number, "videoId": vid, "pageStart": ps, "pageEnd": pe,
            "topic": topic, "duration": int(entry.get("duration") or 0),
        })

    if unparsed:
        print("⚠️ 以下標題無法解析編號，需人工確認：", file=sys.stderr)
        for vid, title in unparsed:
            print(f"   {vid} {title}", file=sys.stderr)
        sys.exit(1)

    available.sort(key=lambda x: x["number"])
    numbers = [x["number"] for x in available]
    if len(set(numbers)) != len(numbers):
        dup = sorted({n for n in numbers if numbers.count(n) > 1})
        print(f"⚠️ 講次編號重複：{dup}", file=sys.stderr)
        sys.exit(1)

    COURSE_DIR.mkdir(parents=True, exist_ok=True)
    (COURSE_DIR / "sessions").mkdir(exist_ok=True)

    course_path = COURSE_DIR / "course.json"
    existing = json.loads(course_path.read_text(encoding="utf-8")) if course_path.exists() else {}
    done_sessions = existing.get("sessions", [])
    done_videos = {s.get("youtubeVideoId") for s in done_sessions}

    pending = []
    for x in available:
        if x["videoId"] in done_videos:
            continue
        sid = f"{x['number']:02d}"
        label = page_label(x["pageStart"], x["pageEnd"])
        title = f"第{sid}講 {x['topic']}".strip()
        pending.append({
            "sessionId": sid,
            "title": title,
            "date": "",
            "pageRange": label,
            "summary": f"{MASTER}《{COURSE_TITLE}》第 {sid} 講「{x['topic']}」（尚未逐字稿）。",
            "lastUpdated": "",
            "jsonUrl": f"courses/{COURSE_TITLE}/sessions/session_{sid}.json",
            "mediaType": "video/youtube",
            "youtubeVideoId": x["videoId"],
            "youtubeUrl": f"https://www.youtube.com/watch?v={x['videoId']}",
            "status": "pending",
        })

    course = {
        "courseId": COURSE_ID,
        "title": COURSE_TITLE,
        "series": "智善法師・菩薩行",
        "master": MASTER,
        "instructor": MASTER,
        "channel": CHANNEL,
        "channelId": CHANNEL_ID,
        "totalSessions": len(available),
        "sourcePlaylist": PLAYLIST_URL,
        "pipelineType": "video/youtube",
        "publicationState": "candidate-review-required",
        "sourceVerification": "ops-pipeline (no base text; ASR + 詞庫校正)",
        "playlistPlannedSessions": 50,
        "unavailableVideoIds": sorted(set(existing.get("unavailableVideoIds", [])) | set(unavailable)),
        "transcriptPublicationState": "candidate-review-required",
        "qualityReview": {
            "readerNotice": f"{COURSE_TITLE} 系列・待閱校版：本系列逐字稿由本地 ASR 轉寫後經詞庫與 AI 校讀校正，尚未經人工逐句聽核。請以音檔為準。",
            "humanProofread": False,
        },
        "tocMode": "sections",
        "sessions": done_sessions,
        "pendingSessions": pending,
    }
    course_path.write_text(json.dumps(course, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    done_ids = {s.get("sessionId") for s in done_sessions}
    sections = []
    for x in available:
        sid = f"{x['number']:02d}"
        sections.append({
            "id": f"sec-{sid}",
            "sessionId": sid,
            "title": x["topic"] or f"第{sid}講",
            "pageRange": page_label(x["pageStart"], x["pageEnd"]),
            "videoId": x["videoId"],
            "durationSec": x["duration"],
            "available": sid in done_ids,
        })
    toc = {
        "courseId": COURSE_ID,
        "courseTitle": COURSE_TITLE,
        "lecturer": MASTER,
        "sourcePlaylist": PLAYLIST_URL,
        "sections": sections,
    }
    (COURSE_DIR / "toc.json").write_text(json.dumps(toc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    entry = {
        "id": COURSE_ID,
        "title": COURSE_TITLE,
        "master": MASTER,
        "description": f"{MASTER}主講《{COURSE_TITLE}》系列課程（高雄法印講堂），依課本頁碼講解菩提心與六度（布施、持戒、忍辱、精進、靜慮、般若）。",
        "path": f"courses/{COURSE_TITLE}",
        "mediaType": "video/youtube",
        "playlistUrl": PLAYLIST_URL,
        "totalSessions": len(available),
        "publicationState": "candidate-review-required",
        "sourceVerification": "ops-pipeline (no base text; ASR + 詞庫校正)",
    }
    courses = [c for c in catalog["courses"] if c.get("id") != COURSE_ID]
    courses.append(entry)
    catalog["courses"] = courses
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"✅ 可用 {len(available)} 講（編號 {numbers[0]}–{numbers[-1]}）；不可用 {len(unavailable)} 支：{unavailable}")
    missing = sorted(set(range(numbers[0], numbers[-1] + 1)) - set(numbers))
    if missing:
        print(f"ℹ️ 編號缺口：{missing}")


if __name__ == "__main__":
    main()
