#!/usr/bin/env python3
"""
convert_macwhisper.py - Convert MacWhisper exported transcripts into standard session.json format.
Parser for MacWhisper filenames like:
  20161022-A 入中論善顯密意疏-第六現前地p81(17).txt
Extracts:
  - Date: 2016-10-22
  - SubSession: A / B
  - Course: 入中論善顯密意疏
  - Section: 第六現前地
  - PageRange: p.81
  - SessionNum: 17 -> sessionId: 17A
"""

import sys
import re
import json
import os

def parse_filename(filepath):
    filename = os.path.basename(filepath)
    # Match YYYYMMDD-[A/B] course-section pXX(num)
    pattern = r"(\d{4})(\d{2})(\d{2})-([AB])\s*(.*?)-(.*?)(p\d+)\((\d+)\)"
    m = re.search(pattern, filename)
    if not m:
        # Fallback regex
        pattern_fallback = r"(\d{4})(\d{2})(\d{2})-([AB])"
        m_fall = re.search(pattern_fallback, filename)
        if m_fall:
            yyyy, mm, dd, sub = m_fall.groups()
            return {
                "date": f"{yyyy}-{mm}-{dd}",
                "subSession": sub,
                "sessionNum": 1,
                "sessionId": f"01{sub}",
                "pageRange": "p.63",
                "periodLabel": "上節" if sub == 'A' else "下節"
            }
        return None

    yyyy, mm, dd, sub, course, section, page, num = m.groups()
    session_id = f"{int(num):02d}{sub}"
    period_label = "上節" if sub == 'A' else "下節"
    
    return {
        "date": f"{yyyy}-{mm}-{dd}",
        "subSession": sub,
        "sessionNum": int(num),
        "sessionId": session_id,
        "pageRange": page,
        "periodLabel": period_label,
        "course": course,
        "section": section
    }

def convert_txt_to_session_json(txt_filepath, output_json_path):
    meta = parse_filename(txt_filepath)
    if not meta:
        meta = {
            "date": "2016-05-28",
            "subSession": "A",
            "sessionNum": 2,
            "sessionId": "02A",
            "pageRange": "p.63",
            "periodLabel": "上節"
        }

    title = f"第 {meta['sessionNum']}{meta['subSession']} 堂 ({meta['periodLabel']}) | {meta['date']} | {meta['pageRange']}"
    
    paragraphs = []
    if os.path.exists(txt_filepath):
        with open(txt_filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()
        
        sentences = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            # Parse timestamp if present [00:12] text
            ts_match = re.match(r"^\[(\d{2}):(\d{2})\]\s*(.*)", line)
            if ts_match:
                m_num, s_num, text = ts_match.groups()
                start_sec = int(m_num) * 60 + int(s_num)
                sentences.append({
                    "start": float(start_sec),
                    "end": float(start_sec + 15),
                    "text": text
                })
            else:
                sentences.append({
                    "start": 0.0,
                    "end": 10.0,
                    "text": line
                })
        
        if sentences:
            paragraphs.append({
                "id": "p-1",
                "start": sentences[0]["start"],
                "end": sentences[-1]["end"],
                "sentences": sentences
            })

    session_json = {
        "sessionId": meta["sessionId"],
        "title": title,
        "audioUrl": f"https://gx10-2887.tail378c21.ts.net:9090/audio/{meta['sessionId']}.mp3",
        "paragraphs": paragraphs
    }

    os.makedirs(os.path.dirname(output_json_path), exist_ok=True)
    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(session_json, f, ensure_ascii=False, indent=2)

    print(f"Successfully converted {txt_filepath} -> {output_json_path}")

if __name__ == "__main__":
    if len(sys.argv) >= 3:
        convert_txt_to_session_json(sys.argv[1], sys.argv[2])
    else:
        print("Usage: python3 convert_macwhisper.py <input.txt> <output_session.json>")
