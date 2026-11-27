#!/usr/bin/env python3
"""
scripts/chaosheng_intake.py

《朝聖前行課程》（2026 印度朝聖前行課程，如性法師）底本 intake。

用途：
  1. 把 LibreOffice 轉出的三校稿純文字（工作區
     /home/henry/.gx10/projects/chaosheng-qianxing-2026/raw/text/*.txt）
     整理成 repo 內的底本 courses/朝聖前行課程/source_text/lecture_0N.txt。
  2. 以**白名單**移除校稿者留給編輯的人工指令標記（【…】），
     逐筆記進 reviews/evidence/朝聖前行課程/work/pending_confirmations.json。
     白名單以外的【】一律保留（科判、經名、法師口語的方括號不得誤殺）。
  3. 把結行問答紀要（非逐字底本，僅結構線索）放進
     reviews/evidence/朝聖前行課程/reference/ 供 domainGroundingGate 驗 sha256。

可重跑（idempotent）。--check-only 只檢查輸出是否仍有白名單標記。
"""

import argparse
import hashlib
import json
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
COURSE_DIR = BASE / "courses" / "朝聖前行課程"
SOURCE_DIR = COURSE_DIR / "source_text"
EVIDENCE = BASE / "reviews" / "evidence" / "朝聖前行課程"
WORK = EVIDENCE / "work"
REFERENCE = EVIDENCE / "reference"

RAW_DIR = Path("/home/henry/.gx10/projects/chaosheng-qianxing-2026/raw")
RAW_TEXT = RAW_DIR / "text"

# 三校稿檔名 → 講次（各檔首行「課程：第N講（…）」自證）
BASE_FILES = {
    "01": "2026臺灣《朝聖前行課程》5-1.txt",
    "02": "2026臺灣《朝聖前行課程》5-2.txt",
    "03": "2026臺灣《朝聖前行課程》5-3.txt",
    "04": "2026臺灣《朝聖前行課程》5-4.txt",
    "05": "2026臺灣《朝聖前行課程》5-5.txt",
}

# ── 白名單：只有「校稿者寫給編輯的指令」才移除 ─────────────────────────────
# 每條規則都要能在 pending_confirmations.json 說明「為什麼算指令而不是正文」。
EDITORIAL_PATTERNS = [
    (re.compile(r"再麻煩確認"), "proofreader-query"),
    (re.compile(r"請確認"), "proofreader-query"),
    (re.compile(r"要用.{0,8}或.{0,8}"), "proofreader-query"),
    (re.compile(r"抱歉.{0,12}干擾"), "audio-gap-note"),
    (re.compile(r"未補錄"), "audio-gap-note"),
    (re.compile(r"前面說"), "wording-note"),
    (re.compile(r"念.{1,3}聲"), "pronunciation-note"),
    (re.compile(r"讀音"), "pronunciation-note"),
    (re.compile(r"其他地方都"), "pronunciation-note"),
]

MARKER_RE = re.compile(r"【[^】]*】")
BOM_RE = re.compile(r"^\ufeff")


def classify_marker(marker: str):
    inner = marker.strip("【】")
    for pattern, kind in EDITORIAL_PATTERNS:
        if pattern.search(inner):
            return kind
    return None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_base_text(path: Path) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    text = BOM_RE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return text


def clean_text(text: str, lecture_id: str, rel_name: str):
    """移除白名單標記，回傳 (清理後文字, pending 清單)。"""
    pending = []
    lines = text.split("\n")
    out_lines = []
    for lineno, line in enumerate(lines, start=1):
        markers = list(MARKER_RE.finditer(line))
        if not markers:
            out_lines.append(line)
            continue
        kept_line = line
        for marker in markers:
            kind = classify_marker(marker.group(0))
            if not kind:
                continue  # 白名單外：保留原樣
            before = kept_line[: marker.start()]
            after = kept_line[marker.end():]
            pending.append({
                "lectureId": lecture_id,
                "file": rel_name,
                "line": lineno,
                "marker": marker.group(0),
                "kind": kind,
                "before": before[-40:],
                "after": after[:40],
                "context": kept_line.strip()[:160],
                "action": "marker removed from base text; recorded for human confirmation",
            })
            kept_line = kept_line[: marker.start()] + kept_line[marker.end():]
        out_lines.append(kept_line)
    cleaned = "\n".join(out_lines)
    # 只剩空白的行併回空行；連續 3 行以上空白壓成 1 行
    cleaned = re.sub(r"[ \t\u3000]+\n", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip("\n") + "\n", pending


def count_remaining_markers(text: str) -> int:
    count = 0
    for marker in MARKER_RE.finditer(text):
        if classify_marker(marker.group(0)):
            count += 1
    return count


def write_source_texts():
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    all_pending = []
    stats = []
    for lecture_id, name in BASE_FILES.items():
        src = RAW_TEXT / name
        if not src.exists():
            raise SystemExit(f"缺少底本檔：{src}（先跑 Task 1.2 的 soffice 轉檔）")
        raw = read_base_text(src)
        cleaned, pending = clean_text(raw, lecture_id, name)
        out = SOURCE_DIR / f"lecture_{lecture_id}.txt"
        out.write_text(cleaned, encoding="utf-8")
        all_pending.extend(pending)
        headings = extract_headings(cleaned)
        stats.append({
            "lectureId": lecture_id,
            "sourceFile": name,
            "sourceSha256": sha256_file(src),
            "outputPath": str(out.relative_to(BASE)),
            "outputSha256": sha256_file(out),
            "chars": len(re.sub(r"\s", "", cleaned)),
            "headingCount": len(headings),
            "headings": headings,
            "markersRemoved": len(pending),
        })
        print(f"[intake] lecture_{lecture_id}: chars={stats[-1]['chars']} "
              f"headings={len(headings)} markers_removed={len(pending)}", flush=True)

    for index, entry in enumerate(all_pending, start=1):
        entry["id"] = f"PC-{index:02d}"
    (WORK / "pending_confirmations.json").write_text(json.dumps({
        "courseId": "chao-sheng-qian-xing-2026",
        "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "note": "三校稿內校稿者留給編輯的人工指令／存疑標記；已自底本正文移除，內容保留於此待 Henry 裁決。",
        "items": all_pending,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    (WORK / "base_text_stats.json").write_text(json.dumps({
        "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "lectures": stats,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return stats, all_pending


HEADING_RE = re.compile(r"^\s*(\d{1,2})[.．、]\s*(.+?)\s*$")


def extract_headings(text: str):
    headings = []
    for line in text.split("\n"):
        match = HEADING_RE.match(line)
        if not match:
            continue
        title = match.group(2).strip()
        # 底本小標都很短；過長者是被斷行的正文，不是小標
        if not title or len(title) > 30:
            continue
        headings.append({"number": int(match.group(1)), "title": title})
    return headings


def stage_closing_reference():
    REFERENCE.mkdir(parents=True, exist_ok=True)
    pdf_src = RAW_DIR / "closing_outline.pdf"
    txt_src = RAW_DIR / "closing_outline.txt"
    for src in (pdf_src, txt_src):
        if not src.exists():
            raise SystemExit(f"缺少結行紀要檔：{src}")
        shutil.copy2(src, REFERENCE / src.name)
    return {
        "pdf": sha256_file(REFERENCE / "closing_outline.pdf"),
        "txt": sha256_file(REFERENCE / "closing_outline.txt"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()

    if args.check_only:
        remaining = 0
        details = []
        for lecture_id in BASE_FILES:
            path = SOURCE_DIR / f"lecture_{lecture_id}.txt"
            if not path.exists():
                print(json.dumps({"error": f"missing {path}", "editorial_markers_remaining": -1},
                                 ensure_ascii=False))
                return 1
            n = count_remaining_markers(path.read_text(encoding="utf-8"))
            remaining += n
            if n:
                details.append({"lectureId": lecture_id, "count": n})
        print(json.dumps({"editorial_markers_remaining": remaining, "details": details},
                         ensure_ascii=False))
        return 0 if remaining == 0 else 1

    stats, pending = write_source_texts()
    closing = stage_closing_reference()
    print(f"[intake] closing outline staged: {closing}")
    print(f"[intake] pending confirmations: {len(pending)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
