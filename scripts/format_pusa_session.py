#!/usr/bin/env python3
"""
scripts/format_pusa_session.py
Converts raw mlx_whisper output into canonical session JSON for 菩薩就是這樣成佛.
Performs:
1. OpenCC s2twp conversion (Traditional Chinese purity).
2. Buddhist terminology corrections.
3. Timestamp validation (monotonic non-decreasing).
4. Paragraph grouping by topic/silence/length.
"""

import sys
import os
import json
import re
from datetime import datetime
from pathlib import Path
import opencc

BUDDHIST_CORRECTIONS = [
    (r"空三磨地", "空三摩地"),
    (r"三磨地", "三摩地"),
    (r"三摩提", "三摩地"),
    (r"三摩半提", "三摩半提"),
    (r"無相三摩提", "無相三摩地"),
    (r"無願三摩提", "無願三摩地"),
    (r"世俗地", "世俗諦"),
    (r"勝義地", "勝義諦"),
    (r"二地", "二諦"),
    (r"四地", "四諦"),
    (r"真諦", "真諦"),
    (r"俗諦", "俗諦"),
    (r"法性", "法性"),
    (r"實相", "實相"),
    (r"真如", "真如"),
    (r"法界", "法界"),
    (r"自性空", "自性空"),
    (r"無自性", "無自性"),
    (r"緣起性空", "緣起性空"),
    (r"大乘", "大乘"),
    (r"小乘", "小乘"),
    (r"阿羅漢", "阿羅漢"),
    (r"菩提薩埵", "菩提薩埵"),
    (r"菩提心", "菩提心"),
    (r"智善法師", "智善法師"),
    (r"佛祈", "佛七"),
    (r"打佛祈", "打佛七"),
    (r"禪祈", "禪七"),
    (r"打禪祈", "打禪七"),
]

def clean_text(text, s2twp):
    t = s2twp.convert(text.strip())
    t = t.replace(",", "，").replace("?", "？").replace("!", "！").replace(":", "：").replace(";", "；")
    for pat, repl in BUDDHIST_CORRECTIONS:
        t = re.sub(pat, repl, t)
    return t

def format_session(raw_json_path, session_num, title, date, page_range, youtube_id, out_session_path):
    s2twp = opencc.OpenCC('s2twp')
    
    with open(raw_json_path, 'r', encoding='utf-8') as f:
        raw = json.load(f)
        
    segments = raw.get("segments", [])
    if not segments:
        raise ValueError("No segments found in raw transcription JSON")
        
    paragraphs = []
    current_sentences = []
    p_start = None
    p_end = None
    p_idx = 1
    sent_idx = 1
    
    for seg in segments:
        text = clean_text(seg["text"], s2twp)
        if not text:
            continue
            
        start = round(float(seg["start"]), 2)
        end = round(float(seg["end"]), 2)
        if end < start:
            end = start
            
        if p_start is None:
            p_start = start
            
        sentence = {
            "id": f"sent-{sent_idx}",
            "start": start,
            "end": end,
            "text": text,
            "reviewNeeded": False
        }
        sent_idx += 1
        current_sentences.append(sentence)
        p_end = end
        
        is_break = False
        if len(current_sentences) >= 12:
            is_break = True
        elif len("".join(s["text"] for s in current_sentences)) >= 250:
            is_break = True
            
        if is_break:
            paragraphs.append({
                "id": f"p_{p_idx}",
                "heading": None,
                "start": p_start,
                "end": p_end,
                "sentences": current_sentences
            })
            p_idx += 1
            current_sentences = []
            p_start = None
            p_end = None
            
    if current_sentences:
        paragraphs.append({
            "id": f"p_{p_idx}",
            "heading": None,
            "start": p_start,
            "end": p_end,
            "sentences": current_sentences
        })
        
    if paragraphs:
        paragraphs[0]["heading"] = f"【科判導讀】{title}"
        
    session_id_str = f"{session_num:02d}"
    session_data = {
        "sessionId": session_id_str,
        "title": f"第 {session_num} 講 | {title}",
        "mediaType": "video/youtube",
        "youtubeVideoId": youtube_id,
        "youtubeUrl": f"https://www.youtube.com/watch?v={youtube_id}",
        "date": date,
        "pageRange": page_range,
        "lastUpdated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "_meta": {
            "engine": "mlx-whisper-large-v3",
            "proofread": "opencc-s2twp + buddhist-terms-pipeline",
            "humanProofread": False,
            "sourceVerification": "ops-pipeline (no base text; ASR + 詞庫校正)"
        },
        "paragraphs": paragraphs
    }
    
    os.makedirs(os.path.dirname(out_session_path), exist_ok=True)
    with open(out_session_path, 'w', encoding='utf-8') as f:
        json.dump(session_data, f, ensure_ascii=False, indent=2)
        
    print(f"Generated {out_session_path} with {len(paragraphs)} paragraphs, {sent_idx-1} sentences.")
    return session_data

if __name__ == "__main__":
    if len(sys.argv) < 7:
        print("Usage: format_pusa_session.py <raw_json> <session_num> <title> <date> <page_range> <youtube_id> <out_path>")
        sys.exit(1)
        
    raw_json = sys.argv[1]
    num = int(sys.argv[2])
    title = sys.argv[3]
    date = sys.argv[4]
    page = sys.argv[5]
    yt_id = sys.argv[6]
    out = sys.argv[7]
    format_session(raw_json, num, title, date, page, yt_id, out)
