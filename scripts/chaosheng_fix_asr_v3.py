#!/usr/bin/env python3
"""依 full large-v3 音窗複核結果，回退第三輪 8 筆過度修正。

證據：178 個音窗（large-v3, int8_float16）＋官方整編校稿（01–05）。
每筆須「find 與現文逐字一致」且過四道護欄，否則整筆跳過不部分套用。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COURSE = ROOT / "courses/朝聖前行課程"
WORK = ROOT / "reviews/evidence/朝聖前行課程/work"

# 與 scripts/check_session.mjs 同源的簡體字集
SIMPLIFIED_ONLY_RE = re.compile(r"[虽却这为体学师义论说对问题发会国经时过还进异间]")
END_PUNCT = "。！？…」』）"

FIXES = [
    # (session, idx, find, replace, 依據)
    ("02", 125, "只要我們學法的心態", "那只要我們學法的心態", "底本5-2「那只要我們學法的心態正確」"),
    ("02", 271, "用在請佛住世。", "用在請佛住世上。", "底本5-2「用在請佛住世上」"),
    ("03", 167, "進入境地的範疇", "進入集諦的範疇", "底本5-3「這就要進入集諦的範疇」"),
    ("04", 130, "因果、四諦、五蘊", "因果、四諦、無我", "底本5-2「因果、四諦、無我」"),
    ("04", 161, "在按部就班的執行", "在按部計畫的執行", "底本5-4「我在按部計畫地執行嗎」"),
    ("05", 178, "去聽了一期共學", "去聽了一組的共學", "底本5-5「去聽了一組的共學」"),
    ("06", 131, "用那個比例去衡量", "用那個比重去衡量", "large-v3 與 turbo 兩次均作「比重」"),
    ("06", 516, "因果、四諦、五蘊這些法類", "因果、四諦、無我這些法類", "large-v3「無我」；04 底本法類三句"),
]


def digits(s):
    return re.findall(r"\d+(?:\.\d+)?", s or "")


def main(dry_run="--dry-run" in sys.argv):
    ledger = {"applied": [], "rejected": []}
    by_session = {}
    for sid, idx, find, repl, why in FIXES:
        by_session.setdefault(sid, []).append((idx, find, repl, why))

    for sid, items in sorted(by_session.items()):
        path = COURSE / "sessions" / f"session_{sid}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        sents = [s for p in data["paragraphs"] for s in p["sentences"]]
        for idx, find, repl, why in items:
            sent = sents[idx - 1]
            text = sent["text"]
            rec = {"session": sid, "idx": idx, "sentenceId": sent.get("id"),
                   "find": find, "replace": repl, "reason": why,
                   "before": text}
            bad = ("find 不在句中" if find not in text else
                   "find 不唯一" if text.count(find) != 1 else
                   "數字改變" if digits(text.replace(find, repl)) != digits(text) else
                   "含簡體字" if SIMPLIFIED_ONLY_RE.search(repl) else
                   "句末標點消失" if text.rstrip()[-1:] in END_PUNCT
                   and text.replace(find, repl).rstrip()[-1:] not in END_PUNCT else
                   "長度變動過大" if abs(len(repl) - len(find)) > 6 else None)
            if bad:
                ledger["rejected"].append({**rec, "guard": bad})
                continue
            new = text.replace(find, repl)
            rec["after"] = new
            ledger["applied"].append(rec)
            sent["text"] = new
        if not dry_run and len(ledger["applied"]):
            data["lastUpdated"] = "2026-11-28 11:40"
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"session {sid}: fixed {sum(1 for r in ledger['applied'] if r['session'] == sid)}/{len(items)}")

    if not dry_run:
        (WORK / "asr_v3_fixes.json").write_text(
            json.dumps(ledger, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"total applied={len(ledger['applied'])} rejected={len(ledger['rejected'])}")
    for r in ledger["rejected"]:
        print("  REJECT", r["session"], r["idx"], r["find"], "|", r["guard"])
    sys.exit(1 if ledger["rejected"] else 0)


if __name__ == "__main__":
    main()
