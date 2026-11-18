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
import subprocess
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


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def official_field(session_id: str, label: str) -> str:
    head = (COURSE_DIR / "source_text" / f"lecture_{session_id}.txt").read_text(encoding="utf-8")[:400]
    match = re.search(rf"{label}：(.+)", head)
    return match.group(1).strip() if match else ""


def normalize_date(raw: str) -> str:
    """官方底本的「日期：2020 年7 月26 日〜8 月2 日」→ 2020-07-26〜2020-08-02。

    第二段常省略年份（「〜8 月2 日」），補前一段的年份。
    """
    year: list[str] = [""]

    def one(match: re.Match) -> str:
        y = match.group(1) or year[0]
        year[0] = y
        return f"{int(y):04d}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"

    out = re.sub(r"(\d{4})?\s*年?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日", one, raw)
    return re.sub(r"\s+", "", out)


def title_for(session_id: str) -> tuple[str, str, str]:
    label = official_field(session_id, "課程")
    date = normalize_date(official_field(session_id, "日期"))
    if not date:
        raise SystemExit(f"lecture_{session_id}: 官方「日期：」列解析失敗")
    if session_id == "01":
        return (f"第01講 導論：{label}", "教學藍圖", date)
    match = re.match(r"第[%s]講（(.+?)）" % CN_NUMERALS, label)
    if not match:
        raise SystemExit(f"lecture_{session_id}: 官方「課程：」列解析失敗：{label!r}")
    topic = match.group(1)
    number = int(session_id)
    return (f"第{number:02d}講 四法印第{CN_NUMERALS[number - 2]}講：{topic}",
            f"四法印・第{CN_NUMERALS[number - 2]}講", date)


# correction-dates.html 一律交由平台正式產生器（scripts/course_correction_dates.mjs）：
# 自己寫一份就成了第二套模板，跑測試時會被正式模板蓋掉，造成「本地綠、CI 紅」的假象。


def write_learned_corrections() -> int:
    """由審核過的自動校字彙整《四法印》術語庫（learned_corrections.json）。

    只收有詞頻佐證的對子（glossary 條目自帶底本詞頻），並記錄政策與出現次數，
    讓後續同講師音檔的 ASR 可以直接沿用；單次且無佐證的改動一律不收。
    """
    terms: dict[str, dict] = {}
    for path in sorted(EVIDENCE.glob("playlist-*/correction_candidates.json")):
        session_id = path.parent.name.replace("playlist-", "")
        data = load_json(path)
        for fix in data.get("applied", []):
            glossary = fix.get("glossary") or {}
            asr_form = glossary.get("asrSpan") or fix["asrDelta"]
            corrected = glossary.get("term") or fix["referenceDelta"]
            if len(corrected) < 2 or asr_form == corrected:
                continue
            entry = terms.setdefault(asr_form, {
                "corrected": corrected,
                "category": "佛法名相",
                "reasoning": (f"官方整編逐字稿作詞頻佐證（底本 {glossary.get('frequency', '—')} 次）；"
                              f"ASR 寫法在 11 份底本零出現；政策 {fix.get('policy', '')}"),
                "policy": fix.get("policy", ""),
                "baseFrequency": glossary.get("frequency"),
                "observedIn": [],
            })
            if session_id not in entry["observedIn"]:
                entry["observedIn"].append(session_id)
    payload = {
        "_metadata": {
            "course": "四法印",
            "courseId": COURSE_ID,
            "instructor": INSTRUCTOR,
            "playlistId": PLAYLIST_URL.split("list=")[1],
            "purpose": "《四法印》ASR 同音訛字對照（由官方整編逐字稿詞頻佐證自動彙整）",
            "derivedFrom": "reviews/evidence/sifayin/playlist-*/correction_candidates.json（applied）",
            "notes": "每筆附底本詞頻與政策；套用前仍需確認語境，不得以此覆蓋講者口語。",
        },
        "global_terms": dict(sorted(terms.items())),
        "context_rules": [],
    }
    (COURSE_DIR / "learned_corrections.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return len(terms)


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
        summary = (f"如性法師：{title}（{date}，本地 ASR 轉寫＋講師官方整編逐字稿名相對校，待閱校版）。"
                   + (f"主旨：{points[0]['text']}" if points else ""))
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

    canonical = subprocess.run(
        ["node", "scripts/course_correction_dates.mjs"], cwd=BASE,
        capture_output=True, text=True, check=True)
    print("[catalog] correction-dates 由正 generator 產出：", canonical.stdout.strip()[:120])
    learned = write_learned_corrections()

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

    print(f"[catalog] sessions={len(sessions)} toc={len(toc_sections)} catalog entries="
          f"{len(catalog['courses'])} learned_terms={learned}")


if __name__ == "__main__":
    main()
