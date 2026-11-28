#!/usr/bin/env python3
"""套用第三輪 MiniMax 審稿的人工核定結果（decisions.json）。

只改 sentences[].text，並在套用前逐句驗證：
  - 句子存在且 find 至少出現一次
  - 數字不變
  - 不得出現簡體字（沿用 scripts/check_session.mjs 的字集）
  - 句末標點不得減少
  - 長度變化不得超過 6 字
任何一項不過即跳過並記錄，不部分套用。
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
COURSE = REPO / "courses" / "朝聖前行課程"
WORK = REPO / "reviews" / "evidence" / "朝聖前行課程" / "work" / "minimax_review"

# 與 scripts/check_session.mjs 的 SIMPLIFIED_ONLY_RE 完全相同（單一真值來源）
SIMPLIFIED_ONLY_RE = re.compile(r"[虽却这为体学师义论说对问题发会国经时过还进异间]")

END_PUNCT = "。！？…"


def digits(s):
    return re.findall(r"\d+(?:\.\d+)?", s or "")


def apply_decisions(dry_run=False):
    dec = json.loads((WORK / "decisions.json").read_text(encoding="utf-8"))
    by_session = {}
    for item in dec["apply"]:
        by_session.setdefault(item["session"], []).append(item)

    ledger = {"applied": [], "rejected": [], "keep": dec["keep"], "pending": dec["pending"],
              "note": "第三輪 MiniMax-M3.1-Flash 審稿；套用前逐句護欄驗證；未做人工聽核"}

    for sid, items in sorted(by_session.items()):
        path = COURSE / "sessions" / f"session_{sid}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        sents = [s for p in data["paragraphs"] for s in p["sentences"]]
        changed = 0
        for item in items:
            idx, find, repl = item["idx"], item["find"], item["replace"]
            if not (1 <= idx <= len(sents)):
                ledger["rejected"].append({**item, "reason": "idx 超出範圍"})
                continue
            sent = sents[idx - 1]
            text = sent["text"]
            if find not in text:
                ledger["rejected"].append({**item, "reason": "find 不在句中"})
                continue
            new = text.replace(find, repl)
            if digits(new) != digits(text):
                ledger["rejected"].append({**item, "reason": "數字改變"})
                continue
            if SIMPLIFIED_ONLY_RE.search(new):
                ledger["rejected"].append({**item, "reason": "含簡體字"})
                continue
            if text.rstrip()[-1:] in END_PUNCT and new.rstrip()[-1:] not in END_PUNCT:
                ledger["rejected"].append({**item, "reason": "句末標點消失"})
                continue
            if abs(len(new) - len(text)) > 6:
                ledger["rejected"].append({**item, "reason": "長度變動過大"})
                continue
            sent["text"] = new
            changed += 1
            ledger["applied"].append({**item, "sentenceId": sent.get("id"),
                                      "start": sent.get("start"),
                                      "before": text, "after": new})
        if changed and not dry_run:
            data["lastUpdated"] = "2026-11-28 09:30"
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"session {sid}: applied={changed}/{len(items)}")

    if not dry_run:
        (WORK / "applied_ledger.json").write_text(
            json.dumps(ledger, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"total applied={len(ledger['applied'])} rejected={len(ledger['rejected'])}")
    if ledger["rejected"]:
        for r in ledger["rejected"][:20]:
            print("  REJECT", r["session"], r["idx"], r["find"], "→", r["replace"], "|", r["reason"])
        sys.exit(1)


if __name__ == "__main__":
    apply_decisions(dry_run="--dry-run" in sys.argv)
