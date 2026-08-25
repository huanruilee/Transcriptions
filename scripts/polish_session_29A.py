#!/usr/bin/env python3
"""
polish_session_29A.py - Comprehensive text polishing, Buddhist term correction,
intelligent punctuation, and readable paragraph structuring for Session 29A.
Strictly preserves acoustic synchronization.
"""
import sys
import os
import json
import re
from pathlib import Path
import opencc

# Buddhist term glossary specifically tailored for 《入中論善顯密意疏》 第 29A 堂 (p.97 觀待世間釋彼差別)
BUDDHIST_GLOSSARY = [
    (r"生一[地諦第]", "勝義諦"),
    (r"勝一[地諦第]", "勝義諦"),
    (r"生意[地諦第]", "勝義諦"),
    (r"世俗[地第]", "世俗諦"),
    (r"四[屬屬][地諦第]", "世俗諦"),
    (r"俗[地第]", "世俗諦"),
    (r"二[地第]", "二諦"),
    (r"四[地第]", "四諦"),
    (r"關帶世間", "觀待世間"),
    (r"觀帶世間", "觀待世間"),
    (r"關待", "觀待"),
    (r"七[狂況礦]法", "欺誑法"),
    (r"不七[狂況礦]法", "不欺誑法"),
    (r"不[欺欺][狂況礦]法", "不欺誑法"),
    (r"羊眼", "陽焰"),
    (r"陽眼", "陽焰"),
    (r"執陽焰[爲為]水", "執陽焰為水"),
    (r"頌[約結約]", "頌曰"),
    (r"頌[雲云]", "頌云"),
    (r"無分微[塵陳]", "無分微塵"),
    (r"現[前千]地", "現前地"),
    (r"善[顯顯]密意[疏書]", "善顯密意疏"),
    (r"入中[論論]", "入中論"),
    (r"自[虛續續]派", "自續派"),
    (r"自[虛續續]", "自續"),
    (r"應成派", "應成派"),
    (r"中[觀觀]派", "中觀派"),
    (r"中[觀觀]宗", "中觀宗"),
    (r"正世俗", "正世俗"),
    (r"[道倒]世俗", "倒世俗"),
    (r"正[道倒]", "正倒"),
    (r"設法", "色法"),
    (r"不先一心法", "不相應行法"),
    (r"不相應行[法識]", "不相應行法"),
    (r"數論", "數論"),
    (r"順世", "順世"),
    (r"神我", "神我"),
    (r"倒[裏裡]面", "倒裡面"),
    (r"所[知智]", "所知"),
    (r"能[知智]", "能知"),
    (r"現量", "現量"),
    (r"比量", "比量"),
    (r"名言", "名言"),
    (r"勝義", "勝義"),
    (r"世俗", "世俗"),
    (r"空[信性]", "空性"),
    (r"如水注水", "如水注水"),
    (r"損壞之因", "損壞之因"),
    (r"六[根識]", "六根"),
    (r"眼[識識]", "眼識"),
    (r"耳[識識]", "耳識"),
    (r"鼻[識識]", "鼻識"),
    (r"舌[識識]", "舌識"),
    (r"身[識識]", "身識"),
    (r"意[識識]", "意識"),
]

def correct_buddhist_terms(text, s2t):
    # Convert traditional
    t_text = s2t.convert(text)
    # Apply regex glossary
    for pattern, repl in BUDDHIST_GLOSSARY:
        t_text = re.sub(pattern, repl, t_text)
    return t_text

def clean_and_punctuate_sentence(text):
    text = text.strip()
    if not text:
        return ""
    
    # Remove awkward leading/trailing oral tokens if isolated
    text = re.sub(r'^[嗯啊喔對哦，、\s]+', '', text)
    if not text:
        return ""

    # Replace multiple spaces
    text = re.sub(r'\s+', '，', text)

    # Ensure ending punctuation
    if not re.search(r'[。？！…」』]$', text):
        if re.search(r'(嗎|呢|吧|對不對|是不是|如何|哪裡|怎麼|為什麼|何須|何故)[？\?]?$', text):
            text = re.sub(r'[，、\s]*$', '？', text)
        elif re.search(r'(啦|啊|嘛|喔|了|的|這樣|這個)[！\!]?$', text):
            text = re.sub(r'[，、\s]*$', '。', text)
        else:
            text = text + '。'

    # Fix repetitive commas
    text = re.sub(r'，{2,}', '，', text)
    text = re.sub(r'，[。？]', '。', text)
    return text

def main():
    json_path = Path("courses/入中論善顯密意疏/sessions/session_29A.json")
    if not json_path.exists():
        print(f"File not found: {json_path}")
        sys.exit(1)

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    s2t = opencc.OpenCC('s2t')

    # Collect all raw sentences
    raw_sents = []
    for p in data["paragraphs"]:
        for s in p["sentences"]:
            raw_sents.append(s)

    print(f"Processing {len(raw_sents)} raw sentences for Session 29A...")

    # Merge short utterance fragments (e.g. pause < 1.0s and combined length < 35 chars)
    merged_sents = []
    curr_chunk = []
    
    for i, s in enumerate(raw_sents):
        curr_chunk.append(s)
        
        is_last = (i == len(raw_sents) - 1)
        next_s = raw_sents[i+1] if not is_last else None
        gap = (next_s["start"] - s["end"]) if next_s else 999.0
        
        combined_text = "".join(x["text"] for x in curr_chunk)
        
        # Decide if chunk should close
        should_close = (
            is_last or
            gap >= 1.1 or
            len(combined_text) >= 28 or
            re.search(r'[。？！]$', s["text"].strip())
        )
        
        if should_close:
            raw_text = " ".join(x["text"].strip() for x in curr_chunk if x["text"].strip())
            corrected = correct_buddhist_terms(raw_text, s2t)
            punctuated = clean_and_punctuate_sentence(corrected)
            
            if punctuated:
                merged_sents.append({
                    "start": curr_chunk[0]["start"],
                    "end": curr_chunk[-1]["end"],
                    "text": punctuated
                })
            curr_chunk = []

    print(f"Consolidated into {len(merged_sents)} natural, readable sentences with full punctuation.")

    # Group into logical thematic paragraphs
    paragraphs = []
    curr_p_sents = []
    p_num = 1

    for i, s in enumerate(merged_sents):
        curr_p_sents.append(s)
        
        is_last = (i == len(merged_sents) - 1)
        next_s = merged_sents[i+1] if not is_last else None
        gap = (next_s["start"] - s["end"]) if next_s else 999.0
        
        total_p_chars = sum(len(x["text"]) for x in curr_p_sents)
        
        # Paragraph boundary: natural thematic break (pause >= 2.0s or sentence count >= 5 or char count >= 150)
        if is_last or gap >= 2.2 or len(curr_p_sents) >= 6 or total_p_chars >= 160:
            paragraphs.append({
                "id": f"p-{p_num}",
                "start": curr_p_sents[0]["start"],
                "end": curr_p_sents[-1]["end"],
                "sentences": curr_p_sents
            })
            p_num += 1
            curr_p_sents = []

    # Format page markers where appropriate (p.97 at start)
    if paragraphs and paragraphs[0]["sentences"]:
        first_sent = paragraphs[0]["sentences"][0]
        if not first_sent["text"].startswith("[p.97]"):
            first_sent["text"] = "[p.97] " + first_sent["text"]

    data["paragraphs"] = paragraphs
    data["_pilot_v2"] = True
    data["_meta"] = {
        "engine": "whisper-large-v3-turbo-polished",
        "audio_duration": paragraphs[-1]["end"] if paragraphs else 0,
        "total_paragraphs": len(paragraphs),
        "total_sentences": len(merged_sents),
        "polished": True
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"🎉 Session 29A successfully polished: {len(paragraphs)} paragraphs, {len(merged_sents)} sentences.")

if __name__ == "__main__":
    main()
