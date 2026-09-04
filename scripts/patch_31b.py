#!/usr/bin/env python3
import json

with open("courses/入中論善顯密意疏/sessions/session_31B.json", "r", encoding="utf-8") as f:
    s31B = json.load(f)

replacements = {
    "五米": "無明",
    "髒斃": "障蔽",
    "假信": "假性",
    "地實": "諦實",
    "生文": "聲聞",
    "已無石子故": "以無實執故",
    "石子故": "實執故",
    "消聞": "消文",
    "七弟": "七地",
    "現正真實義": "現證真實義",
    "現正空性": "現證空性",
    "世論": "《釋論》",
    "巨生": "俱生",
    "空無自信": "空無自性",
    "現有自信": "現有自性",
    "無名": "無明",
    "無自信": "無自性",
    "食指": "實執",
    "之世俗前": "之世俗前",
    "知世俗前": "之世俗前",
    "皆限為諦": "皆現為諦",
    "一段無名者": "已斷無明者",
}

found = 0
for p in s31B["paragraphs"]:
    for s in p["sentences"]:
        orig = s["text"]
        modified = orig
        for k, v in replacements.items():
            if k in modified:
                modified = modified.replace(k, v)
        if orig != modified:
            found += 1
            print(f"[{s.get('start')}s]")
            print(f"  OLD: {orig}")
            print(f"  NEW: {modified}")

print(f"\nTotal corrections found: {found}")
