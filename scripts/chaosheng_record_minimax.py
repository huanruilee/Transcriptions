#!/usr/bin/env python3
"""記錄第三輪 MiniMax 複審到 session metadata：
  - 新增待聽核句標記 reviewNeeded
  - 更新 _meta.correctionsPending
  - 寫入 _meta.minimaxReviewRecord（不宣稱人工聽核）
"""
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
COURSE = REPO / "courses" / "朝聖前行課程"
WORK = REPO / "reviews" / "evidence" / "朝聖前行課程" / "work" / "minimax_review"
STAMP = "2026-11-28 09:30"


def main() -> int:
    ledger = json.loads((WORK / "applied_ledger.json").read_text(encoding="utf-8"))
    applied_by = {}
    for a in ledger["applied"]:
        applied_by[a["session"]] = applied_by.get(a["session"], 0) + 1
    pending_by = {}
    for item in ledger["pending"]:
        pending_by.setdefault(item["session"], []).append(item)

    for sid in ["01", "02", "03", "04", "05", "06"]:
        path = COURSE / "sessions" / f"session_{sid}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        sents = [s for p in data["paragraphs"] for s in p["sentences"]]
        flagged = 0
        for item in pending_by.get(sid, []):
            idx = item["idx"]
            if 1 <= idx <= len(sents) and not sents[idx - 1].get("reviewNeeded"):
                sents[idx - 1]["reviewNeeded"] = True
                flagged += 1
        meta = data["_meta"]
        meta["correctionsPending"] = sum(1 for s in sents if s.get("reviewNeeded"))
        meta["minimaxReviewRecord"] = {
            "reviewedAt": STAMP,
            "model": "MiniMax-M3.1-Flash（經 GX10 Smart LLM Router，OpenAI-compatible）",
            "scope": "第三輪：六節全稿逐句複審（45 句區塊，共 67 區塊）；不含人工逐句聽核",
            "sentenceScope": meta.get("total_sentences"),
            "findingsRaw": 233,
            "findingsValidated": 211,
            "appliedCorrections": applied_by.get(sid, 0),
            "newPendingSentences": len(pending_by.get(sid, [])),
            "asrRecheck": "無新的 full large-v3 獨立複辨（GPU 記憶體被 strata-qwen38 佔用，載入即 CUDA OOM）；"
                           "改以 large-v3-turbo（vad_filter=false）對 104 個候選音窗做旁證，僅供參考",
            "evidence": [
                "reviews/evidence/朝聖前行課程/work/minimax_review/findings.json",
                "reviews/evidence/朝聖前行課程/work/minimax_review/decisions.json",
                "reviews/evidence/朝聖前行課程/work/minimax_review/applied_ledger.json",
            ],
            "humanListened": False,
            "note": "本紀錄不宣稱已完成人工校對或錄音忠實度；成品為待閱校版。",
        }
        data["lastUpdated"] = STAMP
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"session {sid}: pending={meta['correctionsPending']} newFlag={flagged} "
              f"applied={applied_by.get(sid, 0)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
