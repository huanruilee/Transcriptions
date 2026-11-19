#!/usr/bin/env python3
"""《四法印》QA 殘留掃描（唯讀）。

用途：把獨立複驗報告列出的所有「必改」錯誤型態，逐一在 11 講 session JSON
中掃出實例（含 sentenceId），作為套用修正前的基準與修正後的驗收依據。

用法：python3 scripts/sifayin_qa_scan.py            # 列出殘留
"""
from __future__ import annotations

import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
COURSE = BASE / "courses" / "四法印"

# (型態, 應出現的錯誤字串) —— 修正後應全部歸零
BAD_PATTERNS = [
    ("名相-涅槃寂靜", "涅槃寂進"),
    ("名相-緣起性空", "緣起信空"),
    ("名相-有為法", "有違法"),
    ("名相-三緣", "三元"),
    ("名相-無常緣", "無常元"),
    ("名相-能力緣", "能力元"),
    ("名相-依蘊假立", "依孕假立"),
    ("名相-咸歸死", "有命賢歸死"),
    ("名相-三惡趣苦", "三惡去苦"),
    ("名相-惡趣", "惡去"),
    ("名相-質流", "直流"),
    ("名相-無著論師", "吳卓論師"),
    ("名相-緣起讚", "元啟戰"),
    ("名相-釋迦牟尼佛", "釋迦摩尼佛"),
    ("名相-父精母血", "腹筋母血"),
    ("名相-中陰", "中英"),
    ("名相-無始", "無時以來"),
    ("名相-透由", "透有"),
    ("名相-前後世", "前後事"),
    ("名相-統攝", "統設"),
    ("引文-微妙法", "無上甚深為妙法"),
    ("引文-微妙法(脫漏)", "無上生身為妙法"),
    ("引文-真實義", "願解如來真實意"),
    ("引文-真實義(訛字)", "願解如來真實矣"),
    ("錯字-異口同聲", "一口同聲"),
    ("錯字-干擾", "幹擾"),
    ("錯字-干擾(音近)", "感擾"),
    ("錯字-淨除", "禁除罪障"),
    ("錯字-繞著", "圓著"),
    ("錯字-聞法", "文法的動機"),
    ("錯字-拼命地做", "拼命做叫精進"),
    ("錯字-境", "這個禁"),
    ("錯字-唱反調", "暢反調"),
    ("錯字-期勉", "其免自己"),
    ("錯字-和合", "合合"),
    ("錯字-南無", "納摩本師"),
    ("錯字-作觀", "做官"),
    ("錯字-大眾請合掌", "那種請合掌"),
    ("錯字-第三個營隊", "第三次營隊"),
    ("錯字-背心經", "背心經"),
    ("標點-書名號", "《開經偈。"),
    ("標點-控制字元", "‬"),
    ("標點-拉丁垃圾", "circumst"),
    ("標點-拉丁垃圾", "desp"),
    ("建議-輪迴", "輪回"),
    ("建議-想像", "想象"),
]

# 中英夾空格：中文字之間出現半形空白
HALF_SPACE = re.compile(r"[一-鿿] [一-鿿]")


def main() -> int:
    total = 0
    per_pattern: dict[str, list[str]] = {}
    for path in sorted(COURSE.glob("sessions/session_*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        sid = doc["sessionId"]
        for para in doc["paragraphs"]:
            for sent in para["sentences"]:
                for label, bad in BAD_PATTERNS:
                    if bad in sent["text"]:
                        per_pattern.setdefault(label, []).append(f"{sid}/{sent['id']}")
                if HALF_SPACE.search(sent["text"]):
                    per_pattern.setdefault("標點-半形空格", []).append(f"{sid}/{sent['id']}")
    for label, _ in BAD_PATTERNS + [("標點-半形空格", "")]:
        hits = per_pattern.get(label, [])
        if hits:
            total += len(hits)
            print(f"{label}: {len(hits)} 筆 → {', '.join(hits[:8])}"
                  + (f" …(+{len(hits) - 8})" if len(hits) > 8 else ""))
    print(f"\n殘留總數：{total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
