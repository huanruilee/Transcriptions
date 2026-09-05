#!/usr/bin/env python3
"""Re-apply deterministic post-polish (lexicon + S2T + punctuation) to stored
session JSONs — no LLM. For fixing files written before post-polish rules improved."""
import json, re, sys
from pathlib import Path

COURSE = Path("courses/釋量論第二品")
learned = json.load(open(COURSE / "learned_corrections.json"))["global_terms"]
S2T = str.maketrans("们这学时现说应观对变问经运义证实际归觉讲师设点线长门间东车马鸟鱼为当"
                    "艺医还种发话质请关远让从个与会来两儿无气数诸众确诉脱",
                    "們這學時現說應觀對變問經運義證實際歸覺講師設點線長門間東車馬鳥魚為當"
                    "藝醫還種發話質請關遠讓從個與會來兩兒無氣數諸眾確訴脫")

def polish(t):
    for typo, info in learned.items():
        t = re.sub(info.get("safe_regex", re.escape(typo)), info["corrected"], t)
    t = re.sub(r"(?<=[\u4e00-\u9fff]),", "，", t)
    t = re.sub(r",(?=[\u4e00-\u9fff])", "，", t)
    return t.translate(S2T)

for sid in sys.argv[1:]:
    p = COURSE / "sessions" / f"session_{sid}.json"
    d = json.load(open(p))
    n = 0
    for para in d["paragraphs"]:
        for s in para["sentences"]:
            new = polish(s["text"])
            if new != s["text"]:
                s["text"] = new; n += 1
    json.dump(d, open(p, "w"), ensure_ascii=False, indent=2)
    txt = "".join(s["text"] for para in d["paragraphs"] for s in para["sentences"])
    simp = re.findall(r"[们证义讲师说觉实际归运这学]", txt)
    print(f"{sid}: {n} sentences fixed | residual simp: {len(simp)}")
