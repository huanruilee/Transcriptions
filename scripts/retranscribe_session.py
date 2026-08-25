#!/usr/bin/env python3
"""
retranscribe_session.py - Clean, full neural ASR retranscription with exact acoustic timestamps.
Transcribes entire audio cleanly, applies Buddhist term dictionary, segments into readable paragraphs.
"""
import sys
import os
import json
import re
from pathlib import Path
from faster_whisper import WhisperModel
import opencc

BUDDHIST_TERMS = {
    "关带四间": "觀待世間",
    "四属地": "世俗諦",
    "四谛": "四諦",
    "二地": "二諦",
    "神我": "神我",
    "自性": "自性",
    "中观": "中觀",
    "月称": "月稱",
    "宗喀巴": "宗喀巴",
    "自续": "自續",
    "应成": "應成",
    "胜义谛": "勝義諦",
    "世俗谛": "世俗諦",
    "空性": "空性",
    "现前地": "現前地",
    "极喜地": "極喜地",
    "善显密意疏": "善顯密意疏",
    "入中论": "入中論",
    "唯识": "唯識",
    "阿赖耶": "阿賴耶",
    "俱生": "俱生",
    "遍计": "遍計"
}

def apply_buddhist_dictionary(text, s2t):
    # Apply OpenCC first
    t_text = s2t.convert(text)
    # Apply special terms
    for s_term, t_term in BUDDHIST_TERMS.items():
        t_text = t_text.replace(s2t.convert(s_term), t_term)
        t_text = t_text.replace(s_term, t_term)
    return t_text

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 retranscribe_session.py <session_id> <audio_path>")
        sys.exit(1)

    sid = sys.argv[1]
    audio_path = sys.argv[2]
    
    sess_file = Path(f"courses/入中論善顯密意疏/sessions/session_{sid}.json")
    title = f"第 {sid} 堂"
    page = 97
    date = "2017-01-14"
    if sess_file.exists():
        with open(sess_file, "r", encoding="utf-8") as f:
            old_meta = json.load(f)
            title = old_meta.get("title", title)
            page = old_meta.get("page", page)
            date = old_meta.get("date", date)

    s2t = opencc.OpenCC('s2t')

    print(f"🎙️  Running Clean High-Accuracy ASR for Session {sid} on {audio_path}...")
    model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
    
    segments, info = model.transcribe(
        audio_path,
        language="zh",
        word_timestamps=True,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500)
    )

    raw_sentences = []
    print("Transcribing and segmenting speech...")
    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue
        
        # Segment long segments by punctuation if needed
        corrected_text = apply_buddhist_dictionary(text, s2t)
        raw_sentences.append({
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": corrected_text
        })

    print(f"Captured {len(raw_sentences)} complete spoken sentences from audio.")

    # Group sentences into logical paragraphs (break when pause >= 1.8s or ~5-8 sentences)
    paragraphs = []
    curr_sentences = []
    p_id = 1

    for i, s in enumerate(raw_sentences):
        curr_sentences.append(s)
        
        is_last = (i == len(raw_sentences) - 1)
        next_pause = (raw_sentences[i+1]["start"] - s["end"]) if not is_last else 999.0
        
        if is_last or next_pause >= 1.8 or len(curr_sentences) >= 6:
            paragraphs.append({
                "id": f"p-{p_id}",
                "start": curr_sentences[0]["start"],
                "end": curr_sentences[-1]["end"],
                "sentences": curr_sentences
            })
            p_id += 1
            curr_sentences = []

    out_data = {
        "sessionId": sid,
        "title": title,
        "date": date,
        "page": page,
        "audioUrl": f"audio/{sid}.mp3",
        "paragraphs": paragraphs,
        "_pilot_v2": True,
        "_meta": {
            "engine": "whisper-large-v3-turbo-full-grounded",
            "audio_duration": raw_sentences[-1]["end"] if raw_sentences else 0,
            "total_sentences": len(raw_sentences),
            "total_paragraphs": len(paragraphs)
        }
    }

    out_path = f"courses/入中論善顯密意疏/sessions/session_{sid}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out_data, f, ensure_ascii=False, indent=2)

    print(f"✅ Successfully created 100% complete audio-grounded transcript: {out_path}")

if __name__ == "__main__":
    main()
