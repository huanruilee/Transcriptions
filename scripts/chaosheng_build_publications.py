#!/usr/bin/env python3
"""
scripts/chaosheng_build_publications.py

由 courses/朝聖前行課程/sessions/session_0N.json 產生
courses/朝聖前行課程/publications/lecture_0N_reading.md（每節一份，共 6 份）。

形狀照 courses/金剛般若波羅蜜經/publications/lecture_01_reading.md：
標題 → 待閱校聲明 → 講者／日期（標「推定」）／音源＋sha256 → 章節時間碼目錄
→ 正文（段落時間碼連結）→ 討論問題（取自 contentOverview）→ 來源 metadata。

不得填 humanListened=true，不得宣稱音訊忠實度。
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
COURSE_DIR = BASE / "courses" / "朝聖前行課程"
SESSIONS_DIR = COURSE_DIR / "sessions"
PUBLICATIONS_DIR = COURSE_DIR / "publications"

SESSION_IDS = ["01", "02", "03", "04", "05", "06"]

CLOSING_NOTICE = (
    "**待閱校版**：本節**沒有逐字底本**，正文為本機 Whisper ASR 轉寫＋名相校正，"
    "僅以官方問答紀要大綱作結構線索；待確認句已再以 faster-whisper large-v3 複辨並經 AGY 裁決，"
    "第三輪另以 MiniMax 全稿複審套用有依據的局部修正，並以 full large-v3 逐音窗複核、"
    "回退與原音不合的過度修正（見下方 metadata），"
    "**尚未人工逐句聽核**，疑義請配合原音核對。"
)
BASE_NOTICE = (
    "**待閱校版**：本講逐字稿由本機 Whisper ASR 轉寫，並與講師官方整編校稿逐句對校名相與段落小標；"
    "待確認句已再以 faster-whisper large-v3 複辨並經 AGY 裁決，"
    "第三輪另以 MiniMax 全稿複審套用有依據的局部修正，並以 full large-v3 逐音窗複核、"
    "回退與原音不合的過度修正（見下方 metadata），"
    "**尚未人工逐句聽核**，疑義請配合原音核對。"
)


def mmss(seconds: float) -> str:
    total = int(round(float(seconds)))
    return f"{total // 3600:02d}:{(total % 3600) // 60:02d}:{total % 60:02d}" if total >= 3600 else f"{total // 60:02d}:{total % 60:02d}"


def build(session_id: str, course: dict) -> Path:
    session = json.loads((SESSIONS_DIR / f"session_{session_id}.json").read_text(encoding="utf-8"))
    entry = next(s for s in course["sessions"] if s["sessionId"] == session_id)
    audio_url = entry["audioUrl"]
    sha = (session.get("_meta", {}).get("audioSource") or {}).get("sha256") or ""
    duration = session.get("durationSec") or entry.get("durationSec")
    is_closing = session_id == "06"

    lines = [f"# 《朝聖前行：從歡喜欲見到依教奉行》{entry['title']} — 閱讀版", ""]
    lines.append(f"> {CLOSING_NOTICE if is_closing else BASE_NOTICE}")
    lines.append("")
    lines.append("- **講者**：如性法師")
    lines.append(f"- **日期**：{entry['date']}（**推定，待確認**：來源未逐節公告，依音檔 mtime 與正文互證）")
    lines.append(f"- **時長**：{mmss(duration)}")
    lines.append(f"- **音源**：[CSQX_{session_id}.mp3]({audio_url})（GX10 自托管串流，非 Drive 直連）")
    lines.append(f"- **音檔 SHA-256**：`{sha}`")
    lines.append(f"- **逐字稿 JSON**：`courses/朝聖前行課程/sessions/session_{session_id}.json`")
    lines.append("- **publicationState**：`candidate-review-required`（待閱校）")
    lines.append("")

    # 章節目錄
    headings = [p for p in session["paragraphs"] if p.get("heading")]
    if headings:
        lines.append("## 章節")
        lines.append("")
        for para in headings:
            lines.append(f"- [{para['heading']}]({audio_url}#t={int(para['start'])})")
        lines.append("")

    lines.append("## 正文")
    lines.append("")
    for para in session["paragraphs"]:
        if para.get("heading"):
            lines.append(f"### {para['heading']}")
            lines.append("")
        lines.append(f"[▶ {mmss(para['start'])}]({audio_url}#t={int(para['start'])}) "
                     + "".join(s["text"] for s in para["sentences"]))
        lines.append("")

    overview = session.get("contentOverview") or {}
    questions = []
    for item in overview.get("discussionTopics") or []:
        if isinstance(item, dict):
            text = item.get("displayQuestion") or item.get("question") or item.get("text")
        else:
            text = str(item)
        if text:
            questions.append(text)
    for item in session.get("discussionQuestions") or []:
        text = item if isinstance(item, str) else (item.get("displayQuestion") or item.get("question"))
        if text and text not in questions:
            questions.append(text)
    if questions:
        lines.append("## 討論問題")
        lines.append("")
        for question in questions:
            lines.append(f"- {question}")
        lines.append("")

    meta = session.get("_meta", {})
    lines.append("## 來源與狀態")
    lines.append("")
    lines.append(f"- 底本：{'無（本節為 ASR-primary，僅用問答紀要作結構線索）' if is_closing else meta.get('baseText')}")
    lines.append(f"- 底本角色：{meta.get('baseTextRole')}")
    lines.append(f"- ASR：{meta.get('engine', {}).get('asr')}（whisper-gpu-service:8010，600 秒切段、時間碼由 chunks.csv 還原）")
    lines.append(f"- 段落數／句數：{meta.get('total_paragraphs')}／{meta.get('total_sentences')}")
    adj = meta.get("adjudicationRecord", {}) or {}
    second = int(adj.get("appliedCorrections") or 0)
    first = max(int(meta.get("correctionsAutoApplied") or 0) - second, 0)
    lines.append(
        f"- 自動套用的名相校正：第一輪 {first} 筆；第二輪 AGY 裁決套用 {second} 筆；"
        f"待人工確認句數：{meta.get('correctionsPending')}"
    )
    mm = meta.get("minimaxReviewRecord") or {}
    if mm:
        lines.append(
            f"- 第三輪全稿複審：{mm.get('model')}，審閱範圍 {mm.get('sentenceScope')} 句"
            f"（原始發現 {mm.get('findingsRaw')} 筆、驗證後 {mm.get('findingsValidated')} 筆），"
            f"套用局部修正 {mm.get('appliedCorrections')} 筆、新增待聽核 {mm.get('newPendingSentences')} 句；"
            f"{mm.get('asrRecheck')}（{mm.get('evidence')[-1]}）"
        )
    av = meta.get("asrVerifyRecord") or {}
    if av:
        lines.append(
            f"- 第三輪音訊複核：{av.get('model')} 對 {av.get('windows')} 個音窗獨立轉寫，"
            f"覆蓋已套用修正 {av.get('coveredCorrections')} 筆；回退與原音不合者 "
            f"{av.get('revertedCorrections')} 筆（{av.get('verdict')}）"
        )
    if adj:
        lines.append(
            f"- 第二輪裁決：待確認句 {adj.get('adjudicatedSentences')} 句，"
            f"以 faster-whisper large-v3 複辨後經 AGY 裁決，套用修正 {adj.get('appliedCorrections')} 句；"
            f"仍待人工聽核 {adj.get('pendingSentences')} 句（`reviews/evidence/朝聖前行課程/work/adjudication_v3.json`）"
        )
    lines.append(f"- 小標對齊：{meta.get('headingsAnchored')} 個落錨；失敗 {meta.get('headingAlignmentFailures')} 個（失敗者不進正式 heading）")
    lines.append("- 人工聽核：**未執行**（`humanListened` 不填 true）")
    lines.append("")

    PUBLICATIONS_DIR.mkdir(parents=True, exist_ok=True)
    out = PUBLICATIONS_DIR / f"lecture_{session_id}_reading.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    return out


def main() -> int:
    course = json.loads((COURSE_DIR / "course.json").read_text(encoding="utf-8"))
    wanted = sys.argv[1].split(",") if len(sys.argv) > 1 else SESSION_IDS
    for session_id in wanted:
        path = build(session_id.strip(), course)
        print(f"[pub] {path.relative_to(BASE)} {path.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
