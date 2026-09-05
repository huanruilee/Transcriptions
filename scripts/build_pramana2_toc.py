#!/usr/bin/env python3
"""
scripts/build_pramana2_toc.py

Build courses/釋量論第二品/toc.json from the 題綱與偈頌對應 ground-truth file
(gdrive/KnowledgeSources/如性法師教法/釋量論成量品題綱與偈頌對應.md).

題綱 format:
    第一講  調整學法的動機
    一、解釋開經偈
    ...
     【284 彼事讚大師  為即由彼教  成立為量性】

Output toc.json follows DATA_SCHEMA.md CourseTOC: sections[{title, sessionId,
timestamp, children[{title, timestamp, verse?}]}]. Timestamps are 0 until ASR
alignment fills them in (P2+).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path("/home/henry/gdrive/KnowledgeSources/如性法師教法/釋量論成量品題綱與偈頌對應.md")
OUT = ROOT / "courses" / "釋量論第二品" / "toc.json"

CN_NUM = "一二三四五六七八九十"
LECTURE_RE = re.compile(rf"^第([{CN_NUM}]+)講\s+(.*)$")
SUB_RE = re.compile(rf"^([{CN_NUM}]+)、(.+)$")
VERSE_RE = re.compile(r"^【\s*(\d+)?\s*(.*?)】\s*$")

CN_MAP = {}
def cn2int(s):
    # covers 1..32
    ones = {c: i + 1 for i, c in enumerate(CN_NUM[:9])}
    if s == "十":
        return 10
    if s.startswith("十"):
        return 10 + ones[s[1]]
    if s.endswith("十"):
        return ones[s[0]] * 10
    if "十" in s:
        a, b = s.split("十")
        return ones[a] * 10 + ones[b]
    return ones[s]

def main():
    text = SOURCE.read_text(encoding="utf-8")
    sections = []
    current = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = LECTURE_RE.match(line)
        if m:
            num = cn2int(m.group(1))
            current = {
                "title": f"第{m.group(1)}講 {m.group(2).strip()}",
                "sessionId": f"{num:02d}",
                "timestamp": 0,
                "children": [],
            }
            sections.append(current)
            continue
        if current is None:
            continue
        m = VERSE_RE.match(line)
        if m:
            # verse belongs to the last subsection
            verse = {"ref": m.group(1) or "", "text": re.sub(r"\s+", " ", m.group(2).strip())}
            if current["children"]:
                current["children"][-1].setdefault("verses", []).append(verse)
            else:
                current.setdefault("verses", []).append(verse)
            continue
        m = SUB_RE.match(line)
        if m:
            current["children"].append({"title": line, "timestamp": 0})
            continue
        # stray line: attach as note to last child (defensive, shouldn't happen)
        if current["children"]:
            current["children"][-1]["title"] += " " + line

    assert len(sections) == 32, f"expected 32 lectures, got {len(sections)}"
    toc = {
        "courseId": "shi-liang-lun-er",
        "title": "釋量論第二品",
        "totalSections": 32,
        "sections": sections,
        "coverage": {
            "source": "釋量論成量品題綱與偈頌對應.md（如性法師 2018 南印題綱）",
            "timestampsAligned": False,
        },
    }
    OUT.write_text(json.dumps(toc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total_children = sum(len(s["children"]) for s in sections)
    print(f"OK: {len(sections)} sections, {total_children} subsections -> {OUT}")

if __name__ == "__main__":
    main()
