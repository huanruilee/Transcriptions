#!/usr/bin/env python3
"""用 full large-v3 的音窗轉寫，回頭核對第三輪套用的 86 筆修正。

輸入：
  reviews/evidence/朝聖前行課程/work/minimax_review/mm_windows_index.json  （音窗 → session/idx）
  reviews/evidence/朝聖前行課程/work/minimax_review/applied_ledger.json    （before/after）
  ASR 輸出目錄（每窗一個 JSON，含 text）
輸出：reviews/evidence/朝聖前行課程/work/asr_v3_verify.json + 終端摘要

判定方式（刻意保守）：
  把 ASR 文本與 before / after 各自正規化（簡→繁、去標點空白）後取 SequenceMatcher
  相似度；差距 >0.005 才表態，否則算持平。ASR 只用來判斷「音訊更接近哪一版」，
  不直接改稿——改稿仍需底本或課內一致。
"""
import json
import sys
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

from opencc import OpenCC

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "reviews/evidence/朝聖前行課程/work"
MM = WORK / "minimax_review"
ASR_DIR = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/mm/out")
COURSE = ROOT / "courses/朝聖前行課程"
CC = OpenCC("s2t")

PUNCT = "，。、；：？！「」『』（）()〈〉《》…—─·,.;:?!\"' \n\t"


def norm(s):
    s = CC.convert(unicodedata.normalize("NFKC", s or ""))
    return "".join(ch for ch in s if ch not in PUNCT)


def sim(a, b):
    return SequenceMatcher(None, a, b, autojunk=False).ratio()


def main():
    index = json.loads((MM / "mm_windows_index.json").read_text(encoding="utf-8"))
    ledger = json.loads((MM / "applied_ledger.json").read_text(encoding="utf-8"))
    pending = ledger.get("pending") or []

    asr = {}
    for path in sorted(ASR_DIR.glob("*.json")):
        key = path.stem[1:] if path.stem.startswith("m") else path.stem
        asr[key] = json.loads(path.read_text(encoding="utf-8")).get("text", "")

    rows = []
    for item in ledger["applied"]:
        key = f"{item['session']}_{int(item['idx']):04d}"
        text = asr.get(key)
        row = {**{k: item[k] for k in ("session", "idx", "find", "replace")},
               "sentenceId": item.get("sentenceId"), "window": key, "asr": text}
        if not text:
            row["verdict"] = "no_window"
        else:
            n = norm(text)
            s_before, s_after = sim(n, norm(item["before"])), sim(n, norm(item["after"]))
            row["simBefore"], row["simAfter"] = round(s_before, 4), round(s_after, 4)
            d = s_after - s_before
            row["verdict"] = ("supports_after" if d > 0.005 else
                              "supports_before" if d < -0.005 else "tie")
        rows.append(row)

    out = WORK / "asr_v3_verify.json"
    out.write_text(json.dumps({"asrDir": str(ASR_DIR), "windows": len(asr), "rows": rows,
                               "pending": pending}, ensure_ascii=False, indent=2) + "\n",
                   encoding="utf-8")

    tally = {}
    for r in rows:
        tally[r["verdict"]] = tally.get(r["verdict"], 0) + 1
    print(f"ASR 音窗 {len(asr)}；已核對 {len(rows)} 筆套用修正")
    print("判定:", tally)
    for r in rows:
        if r["verdict"] == "supports_before":
            print(f"  ⚠ {r['session']}/{r['idx']} {r['find']}→{r['replace']} "
                  f"sim before={r.get('simBefore')} after={r.get('simAfter')}")
            print(f"      ASR: {r['asr'][:100]}")
    print(f"明細: {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
