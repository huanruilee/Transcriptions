#!/usr/bin/env python3
"""
add_headings_session_29A.py - Adds structural headings and re-clusters paragraphs
into coherent thematic sections according to Buddhist commentary logic.
"""
import json
import re
from pathlib import Path

def main():
    json_path = Path("courses/入中論善顯密意疏/sessions/session_29A.json")
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Define thematic heading markers based on timestamp intervals and text milestones
    # Session 29A total duration ~3915s (~65 min)
    # Section breakdowns:
    # 1. 0s - 450s: 釋彼差別科判與所知二諦建立 (p.97 觀待世間釋世俗差別)
    # 2. 450s - 1050s: 自續派與應成派對「正倒世俗」之主張辨析
    # 3. 1050s - 1750s: 損壞根識之外在因：陽焰、幻化、咒術、旋火輪
    # 4. 1750s - 2450s: 損壞根識之內在因：眩翳、飛蚊症、膽熱病
    # 5. 2450s - 3150s: 世間名言識無損害（正世俗）與有損害（倒世俗）之分齊
    # 6. 3150s - 3650s: 觀待世間與觀待勝義理智之差異（中觀應成自宗）
    # 7. 3650s - 結束: 課堂問答辨析與本節總結

    heading_rules = [
        (0.0, "【科判引導】觀待世間釋世俗諦差別與所知二諦（p.97）"),
        (480.0, "【宗派辨析】自續派與應成派對「正世俗、倒世俗」之立論差異"),
        (1080.0, "【損害外因】外在損壞根識之因：陽焰為水、幻術、咒術與旋火輪"),
        (1780.0, "【損害內因】內在損害根識之因：眩翳、飛蚊症與膽熱病"),
        (2480.0, "【世間正倒】世間無過失識（正世俗識）與有過失識（倒世俗識）之分齊"),
        (3180.0, "【勝義抉擇】觀待世間名言識 vs 觀待中觀正理實相"),
        (3620.0, "【隨堂答疑】外道神我、科學觀察與本節開示總結"),
    ]

    # Assign headings to the first paragraph starting after each threshold
    rule_idx = 0
    for p in data["paragraphs"]:
        # Remove any existing heading
        p.pop("heading", None)
        
        if rule_idx < len(heading_rules):
            thresh, title = heading_rules[rule_idx]
            if p["start"] >= thresh:
                p["heading"] = title
                rule_idx += 1

    # Merge very small 1-sentence paragraphs into preceding/following paragraphs for better reading flow
    new_paragraphs = []
    for p in data["paragraphs"]:
        if not new_paragraphs:
            new_paragraphs.append(p)
            continue
        
        prev_p = new_paragraphs[-1]
        # If current paragraph has a heading, always keep as separate paragraph
        if "heading" in p:
            new_paragraphs.append(p)
        elif len(p["sentences"]) <= 2 and len(prev_p["sentences"]) <= 4 and (p["start"] - prev_p["end"] < 2.5):
            # Merge into prev_p
            prev_p["sentences"].extend(p["sentences"])
            prev_p["end"] = p["end"]
        else:
            new_paragraphs.append(p)

    # Re-index paragraph IDs
    for idx, p in enumerate(new_paragraphs, 1):
        p["id"] = f"p-{idx}"

    data["paragraphs"] = new_paragraphs
    data["_meta"]["total_paragraphs"] = len(new_paragraphs)
    data["_meta"]["has_headings"] = True

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"🎉 Successfully restructured into {len(new_paragraphs)} paragraphs with {len(heading_rules)} thematic headings.")

if __name__ == "__main__":
    main()
