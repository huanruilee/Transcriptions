#!/usr/bin/env python3
"""
scripts/sifayin_build_catalog.py

由已落盤的證據與 session 檔產生《四法印》課程註冊資料：

  courses/四法印/course.json   （11 講 session 清單）
  courses/四法印/toc.json      （sections = 11 講，含 videoId／durationSec）
  courses/catalog.json         （新增 si-fa-yin 一列；冪等）

標題取自官方整編稿的「課程：…」列（第一講〜第十講）與官方播放列表標題，
時間與频道資訊取自 reviews/evidence/sifayin/video_metadata.tsv，
不自行編造講次名稱。
"""

import json
import re
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
COURSE_DIR = BASE / "courses" / "四法印"
EVIDENCE = BASE / "reviews" / "evidence" / "sifayin"

COURSE_ID = "si-fa-yin"
PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLMngxNMnjFcPB4eYNHrOUdCgh__7hF2hl"
CHANNEL = "如來法性影音頻道"
CHANNEL_ID = "UCcL81Q7idwmC-AIFGtKt8Pg"
INSTRUCTOR = "如性法師"
CN_NUMERALS = "一二三四五六七八九十"

SESSION_TITLES = {
    "01": ("第01講 導論：法師的教學藍圖與建議", "教學藍圖", "2020-07-25"),
}


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def official_course_label(session_id: str) -> str:
    head = (COURSE_DIR / "source_text" / f"lecture_{session_id}.txt").read_text(encoding="utf-8")[:400]
    match = re.search(r"課程：(.+)", head)
    return match.group(1).strip() if match else ""


def title_for(session_id: str) -> tuple[str, str, str]:
    if session_id in SESSION_TITLES:
        return SESSION_TITLES[session_id]
    label = official_course_label(session_id)
    match = re.match(r"(第[%s]講)（(.+?)）" % CN_NUMERALS, label)
    if not match:
        raise SystemExit(f"lecture_{session_id}: 官方「課程：」列解析失敗：{label!r}")
    official, topic = match.group(1), match.group(2)
    number = int(session_id)
    return (f"第{number:02d}講 四法印{official}：{topic}", f"四法印・{official}", "2020-07-26〜2020-08-02")


def write_correction_dates(sessions: list[dict]) -> None:
    rows = "".join(
        f'<tr><th scope="row"><a href="../../?course={COURSE_ID}&amp;session={entry["sessionId"]}">'
        f'{entry["sessionId"]}</a></th><td>{entry["title"]}</td>'
        f'<td>{entry["lastUpdated"]}</td><td>session_{entry["sessionId"]}.json 之 lastUpdated（ASR＋自動校字產出日）</td></tr>'
        for entry in sessions
    )
    html = (
        '<!doctype html><html lang="zh-Hant"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>四法印｜各講逐字稿產出日期</title>'
        '<style>body{font:17px/1.7 system-ui;background:#f7f4ee;color:#263029;margin:0}'
        'main{max-width:1100px;margin:auto;padding:24px}table{width:100%;border-collapse:collapse;background:white}'
        'th,td{padding:12px;text-align:left;border-bottom:1px solid #ddd}caption{text-align:left;font-weight:bold}'
        'a{color:#285a3b}.scroll{overflow-x:auto}small{color:#59685b}</style><main>'
        f'<a href="../../?course={COURSE_ID}">← 返回課程</a><h1>四法印：各講逐字稿產出／更新日期</h1>'
        f'<p>本頁記錄本課程 {len(sessions)} 講逐字稿的最近產出／更新日期。日期取自正式逐字稿的更新欄位，'
        '不是授課日、部署日或試閱候選日期。<strong>本課程目前全數為待閱校版</strong>：逐字稿由本地 ASR 轉寫並以講師提供的'
        '官方整編逐字稿做名相對校，尚未逐句人工聽核；有日期不代表已聽核。未記錄表示缺少有效日期，不代表從未校訂。</p>'
        '<div class="scroll"><table><caption>正式逐字稿記錄日期</caption><thead><tr><th scope="col">講次</th>'
        '<th scope="col">標題</th><th scope="col">最後校訂／更新日期（原記錄）</th><th scope="col">日期來源</th></tr></thead>'
        f'<tbody>{rows}</tbody></table></div><small>共 {len(sessions)} 講</small></main></html>'
    )
    (COURSE_DIR / "correction-dates.html").write_text(html, encoding="utf-8")


def main() -> None:
    manifest = load_json(EVIDENCE / "intake_manifest.json")["sessions"]
    reference_inventory = load_json(EVIDENCE / "reference" / "reference_inventory.json")["references"]
    video_meta = {}
    for line in (EVIDENCE / "video_metadata.tsv").read_text(encoding="utf-8").splitlines():
        video_id, upload_date, duration, channel, channel_id = line.split("|")
        video_meta[video_id] = {
            "uploadDate": f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:]}",
            "durationSec": int(duration),
        }

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    sessions = []
    for session_id in sorted(manifest):
        info = manifest[session_id]
        session_path = COURSE_DIR / "sessions" / f"session_{session_id}.json"
        if not session_path.exists():
            raise SystemExit(f"缺少 {session_path.relative_to(BASE)}；先跑 sifayin_build_transcript.py")
        session = load_json(session_path)
        title, page_range, date = title_for(session_id)
        overview = session.get("contentOverview") or {}
        points = overview.get("mainPoints") or []
        summary = (
            f"如性法師：四法印 {title.split(' 導論')[0]}（本地 ASR + 官方整編底本名相對校，待閱校版）。"
            if not points else
            f"如性法師：{title}（本地 ASR + 官方整編底本名相對校，待閱校版）。主旨：{points[0]['text']}"
        )
        sessions.append({
            "sessionId": session_id,
            "title": title,
            "date": date,
            "pageRange": page_range,
            "summary": summary,
            "lastUpdated": session["lastUpdated"],
            "jsonUrl": f"courses/四法印/sessions/session_{session_id}.json",
            "mediaType": "video/youtube",
            "youtubeVideoId": info["youtubeVideoId"],
            "youtubeUrl": f"https://www.youtube.com/watch?v={info['youtubeVideoId']}",
            "status": "candidate",
            "publicationState": "candidate-review-required",
            "transcriptStatus": "candidate-review-required",
        })

    course = {
        "courseId": COURSE_ID,
        "title": "四法印",
        "series": "如性法師・臺灣營隊系列三",
        "master": INSTRUCTOR,
        "totalSessions": len(sessions),
        "sourcePlaylist": PLAYLIST_URL,
        "pipelineType": "video/youtube",
        "publicationState": "candidate-review-required",
        "sourceVerification": "official-base-text (官方整編逐字稿 PDF) + ASR 時間碼 + 提綱切段",
        "instructor": INSTRUCTOR,
        "channel": CHANNEL,
        "channelId": CHANNEL_ID,
        "recordingPeriod": "2020-07-25 導論；2020-07-26〜2020-08-02 臺灣營隊十講（頻道 2021-01〜2021-04 上傳）",
        "updatedAt": now,
        "sessions": sessions,
        "pendingSessions": [],
        "transcriptPublicationState": "candidate-review-required",
        "qualityReview": {
            "readerNotice": "四法印系列・待閱校版：逐字稿由本地 ASR 轉寫，並與講師提供的官方整編逐字稿逐句對校名相（同音訛誤自動套用、其餘標記存疑），尚未經人工逐句聽核。請以音檔為準。",
            "humanProofread": False,
        },
        "tocMode": "sections",
        "studyGuides": [],
        "referenceMaterials": [
            {
                "referenceId": ref["referenceId"],
                "type": ref["type"],
                "local_path": ref["local_path"],
                "sha256": ref["sha256"],
            }
            for ref in reference_inventory
        ],
    }

    COURSE_DIR.mkdir(parents=True, exist_ok=True)
    (COURSE_DIR / "course.json").write_text(json.dumps(course, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    toc_sections = []
    for entry in sessions:
        meta = video_meta[entry["youtubeVideoId"]]
        toc_sections.append({
            "id": f"sec-{entry['sessionId']}",
            "sessionId": entry["sessionId"],
            "title": entry["title"].split("講 ", 1)[1],
            "videoId": entry["youtubeVideoId"],
            "durationSec": meta["durationSec"],
            "available": True,
            "sessionRef": f"courses/四法印/sessions/session_{entry['sessionId']}.json",
        })
    (COURSE_DIR / "toc.json").write_text(json.dumps({
        "courseId": COURSE_ID,
        "courseTitle": "四法印",
        "lecturer": INSTRUCTOR,
        "sourcePlaylist": PLAYLIST_URL,
        "sections": toc_sections,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    write_correction_dates(sessions)

    catalog_path = BASE / "courses" / "catalog.json"
    catalog = load_json(catalog_path)
    entry = {
        "id": COURSE_ID,
        "title": "四法印",
        "master": INSTRUCTOR,
        "description": "如性法師於 2020 年臺灣營隊主講《四法印》：導論＋十講，依次解說諸行無常、有漏皆苦、諸法無我、涅槃寂靜。逐字稿以本地 ASR 轉寫，並與講師提供的官方整編逐字稿逐句對校名相。",
        "path": "courses/四法印",
        "mediaType": "video/youtube",
        "playlistUrl": PLAYLIST_URL,
        "totalSessions": len(sessions),
        "publicationState": "candidate-review-required",
        "sourceVerification": "official-base-text (官方整編逐字稿 PDF) + ASR 時間碼 + 提綱切段",
    }
    existing = next((c for c in catalog["courses"] if c["id"] == COURSE_ID), None)
    if existing:
        existing.update(entry)
    else:
        catalog["courses"].append(entry)
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"[catalog] sessions={len(sessions)} toc={len(toc_sections)} catalog entries={len(catalog['courses'])}")


if __name__ == "__main__":
    main()
