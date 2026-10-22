#!/usr/bin/env python3
"""T1: 將 36A/36B 已驗證的同音錯字寫入 learned_corrections.json（冪等）。"""
import json
from datetime import datetime, timezone
from pathlib import Path

P = Path("/Users/henry/Documents/huanruilee-github-repos/Transcriptions/courses/入中論善顯密意疏/learned_corrections.json")
REF = "善顯密意疏 p.104-115（36A/36B 驗證）"

NEW = [
    # typo, corrected, category, safe_regex, reasoning
    ("一百年事業", "一百零四頁", "頁碼口述", "一百年事業", "36A 開頭格西翻回第 104 頁，ASR 誤聽。"),
    ("臥行常斷", "苦行常斷", "佛傳典故", "臥行常斷", "佛陀六年苦行，ASR 誤聽臥行。"),
    ("臥行", "苦行", "佛傳典故", "(?<=能夠)臥行|臥行(?=的話)", "佛陀苦行，限語境避免誤傷。"),
    ("另一方面的中庸", "定方面的中庸", "三學名相", "另一方面的中庸", "戒定慧三學之定學中道。"),
    ("會方面的中庸", "慧方面的中庸", "三學名相", "會方面的中[庸道]?", "慧學中道，ASR 誤聽會。"),
    ("蓄留異弊", "續流亦必", "經論引文", "[蓄序]留[異亦][弊必]", "法尊譯「種子續流亦必間斷無疑」。"),
    ("無少億", "無少益", "經論引文", "無少[億亦]", "「於聖人自斷生死無少益也」。"),
    ("樹說", "數說", "經論引文", "樹說(?=\\s*芽)", "「論中數說芽時種滅」。"),
    ("色有四面", "設有是念", "經論引文", "色有四面", "「設有是念：若有芽生」。"),
    ("應非理的種別生", "應非離種別生", "經論引文", "非理的種別生", "「應非離種別生」。"),
    ("雙鋪耳邊", "雙破二邊", "經論引文", "雙鋪耳邊", "「如是雙破二邊」。"),
    ("看人觀察", "堪忍觀察", "中觀量論名相", "看人(?=\\s*(正理)?觀察)", "堪忍正理觀察。"),
    ("七款", "欺誑", "中觀量論名相", "七款|棄狂|欺狂", "不欺誑法／虛妄欺誑之法。"),
    ("必知如必喜", "棄之如敝屣", "口語成語", "必知如.{0,8}必喜", "成語棄之如敝屣。"),
    ("總道是沒有", "宗大師沒有", "人名尊稱", "[總中]道是沒有", "宗大師沒有這樣解釋。"),
    ("志向有", "自相有", "中觀量論名相", "志向有|有志向", "自相有（svalakṣaṇa）。"),
    ("勝儀", "勝義", "中觀量論名相", "勝儀|聖意(?=[中上諦有觀])", "勝義（paramārtha）。"),
    ("明言諦", "名言諦", "中觀量論名相", "明言(?=[諦上有法識的])", "名言（vyavahāra），限語境避免誤傷。"),
    ("限量", "現量", "因明邏輯名相", "限量(?=[跟和與前])", "現量與比量。"),
    ("專破秩序", "專破自續", "宗義名相", "破秩序", "專破自續派。"),
    ("盡是你常斷", "即是離常斷", "經論引文", "盡是你常斷", "「即顯彼芽性是離常斷之法性也」。"),
    ("自信你動搖", "自性離動搖", "經論引文", "自[信行]你?\\s*動搖|自行離動搖", "《廣大遊戲經》「自性離動搖」。"),
]

def main():
    d = json.loads(P.read_text(encoding="utf-8"))
    g = d["global_terms"]
    added = 0
    for typo, corr, cat, rx, why in NEW:
        if typo in g:
            continue
        g[typo] = {"corrected": corr, "category": cat, "safe_regex": rx,
                   "treatise_ref": REF, "confidence": 0.95, "reasoning": why}
        added += 1
    d["_metadata"]["totalGlobalTerms"] = len(g)
    d["_metadata"]["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    P.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"added {added}, total {len(g)}")

if __name__ == "__main__":
    main()
