#!/usr/bin/env python3
"""把 full large-v3 音窗複核結果寫進各節 session `_meta.asrVerifyRecord`。

只記錄「做了什麼、覆蓋多少、回退多少」，不改 `humanListened`，也不宣稱人工聽核。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COURSE = ROOT / "courses/朝聖前行課程"
WORK = ROOT / "reviews/evidence/朝聖前行課程/work"

VERDICT = ("6 筆依官方整編校稿（集諦／無我／按部計畫／一組的共學／那只要／請佛住世上）、"
           "2 筆依 large-v3 與 turbo 一致之讀音（比重／無我）")


def main():
    verify = json.loads((WORK / "asr_v3_verify.json").read_text(encoding="utf-8"))
    fixes = json.loads((WORK / "asr_v3_fixes.json").read_text(encoding="utf-8"))
    covered, reverted = {}, {}
    for row in verify["rows"]:
        if row["verdict"] != "no_window":
            covered[row["session"]] = covered.get(row["session"], 0) + 1
    for row in fixes["applied"]:
        reverted[row["session"]] = reverted.get(row["session"], 0) + 1

    for sid in ["01", "02", "03", "04", "05", "06"]:
        path = COURSE / "sessions" / f"session_{sid}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        meta = data["_meta"]
        meta["asrVerifyRecord"] = {
            "reviewedAt": "2026-11-28 11:40",
            "model": "faster-whisper large-v3（本地 snapshot, int8_float16, vad_filter=false）",
            "windows": verify["windows"],
            "coveredCorrections": covered.get(sid, 0),
            "revertedCorrections": reverted.get(sid, 0),
            "verdict": VERDICT if reverted.get(sid) else "本節無需回退",
            "evidence": [
                "reviews/evidence/朝聖前行課程/work/asr_v3_verify.json",
                "reviews/evidence/朝聖前行課程/work/asr_v3_fixes.json",
            ],
            "humanListened": False,
            "note": "獨立於 MiniMax 的音訊複核；僅回退與原音或底本不合者，未做人工逐句聽核",
        }
        mm = meta.get("minimaxReviewRecord")
        if mm:
            mm["asrRecheck"] = (
                f"已補做 full large-v3 獨立複辨：{verify['windows']} 個音窗，"
                f"覆蓋已套用修正 {covered.get(sid, 0)} 筆；據此回退 {reverted.get(sid, 0)} 筆過度修正"
            )
        # 本輪改了 _meta 即算本講有更新，日期必須同步（strict gate 會比 base）
        data["lastUpdated"] = "2026-11-28 11:40"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"session {sid}: covered={covered.get(sid, 0)} reverted={reverted.get(sid, 0)}")


if __name__ == "__main__":
    main()
