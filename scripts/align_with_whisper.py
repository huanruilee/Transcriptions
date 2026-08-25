#!/usr/bin/env python3
"""
align_with_whisper.py - Continuous acoustic alignment using faster-whisper.
Aligns existing session JSON text against audio without artificial chunk boundaries.
"""
import sys
import os
import json
import re
from pathlib import Path
from faster_whisper import WhisperModel
import opencc

def normalize_char(c):
    # Convert traditional/simplified to common simplified for matching
    return c.strip()

def clean_text_for_match(text):
    # Strip markdown page markers like [p.97]
    cleaned = re.sub(r'\[p\.\d+\]', '', text)
    # Strip non-chinese/non-alphanumeric punctuation
    cleaned = re.sub(r'[^\w\u4e00-\u9fff]', '', cleaned)
    return cleaned

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 align_with_whisper.py <session_id> <audio_path>")
        sys.exit(1)

    sid = sys.argv[1]
    audio_path = sys.argv[2]
    
    sess_file = Path(f"courses/入中論善顯密意疏/sessions/session_{sid}.json")
    if not sess_file.exists():
        print(f"Session file not found: {sess_file}")
        sys.exit(1)

    with open(sess_file, "r", encoding="utf-8") as f:
        sess_data = json.load(f)

    converter = opencc.OpenCC('t2s')
    s2t = opencc.OpenCC('s2t')

    print(f"Loading WhisperModel large-v3-turbo on {audio_path}...")
    model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
    
    segments, info = model.transcribe(audio_path, language="zh", word_timestamps=True, vad_filter=True)

    whisper_words = []
    print("Transcribing and extracting acoustic word timestamps...")
    for seg in segments:
        if seg.words:
            for w in seg.words:
                cleaned_word = re.sub(r'[^\w\u4e00-\u9fff]', '', w.word)
                if cleaned_word:
                    whisper_words.append({
                        "word": cleaned_word,
                        "norm": converter.convert(cleaned_word),
                        "start": round(w.start, 3),
                        "end": round(w.end, 3)
                    })
        else:
            cleaned_text = re.sub(r'[^\w\u4e00-\u9fff]', '', seg.text)
            if cleaned_text:
                whisper_words.append({
                    "word": cleaned_text,
                    "norm": converter.convert(cleaned_text),
                    "start": round(seg.start, 3),
                    "end": round(seg.end, 3)
                })

    print(f"Extracted {len(whisper_words)} acoustic word blocks from audio.")

    # Flatten existing sentences from session JSON
    flat_sentences = []
    for pi, p in enumerate(sess_data["paragraphs"]):
        for si, s in enumerate(p["sentences"]):
            orig_text = s["text"]
            matchable = clean_text_for_match(orig_text)
            norm_matchable = converter.convert(matchable)
            flat_sentences.append({
                "pi": pi,
                "si": si,
                "orig_text": orig_text,
                "norm_text": norm_matchable,
                "len": len(norm_matchable)
            })

    print(f"Matching {len(flat_sentences)} existing sentences against acoustic timeline...")

    # Monotonic greedy forward matching with lookahead
    w_idx = 0
    total_words = len(whisper_words)

    for sent in flat_sentences:
        target_norm = sent["norm_text"]
        if not target_norm:
            continue
        
        # Look ahead in whisper_words starting from w_idx to find best matching start
        best_start_idx = w_idx
        best_score = -1
        
        search_window = min(w_idx + 120, total_words)
        for cand_idx in range(w_idx, search_window):
            # Check overlap between target_norm and words starting at cand_idx
            cand_str = "".join(w["norm"] for w in whisper_words[cand_idx:cand_idx+15])
            # Common prefix or containment
            score = 0
            if target_norm[:3] in cand_str:
                score += 10
            if target_norm[:6] in cand_str:
                score += 20
            if score > best_score:
                best_score = score
                best_start_idx = cand_idx
                if score >= 20:
                    break

        # Consume words until length roughly matches
        start_time = whisper_words[best_start_idx]["start"]
        curr_chars = 0
        end_idx = best_start_idx
        while end_idx < total_words and curr_chars < sent["len"]:
            curr_chars += len(whisper_words[end_idx]["norm"])
            end_idx += 1
        
        end_idx = max(best_start_idx, end_idx - 1)
        end_time = whisper_words[end_idx]["end"]
        if end_time < start_time:
            end_time = start_time + 1.0

        # Update sentence timestamps in sess_data
        target_sentence = sess_data["paragraphs"][sent["pi"]]["sentences"][sent["si"]]
        target_sentence["start"] = start_time
        target_sentence["end"] = end_time

        w_idx = max(w_idx, end_idx)

    # Recalculate paragraph start/end from its sentences
    for p in sess_data["paragraphs"]:
        valid_s = [s for s in p["sentences"] if "start" in s and "end" in s]
        if valid_s:
            p["start"] = valid_s[0]["start"]
            p["end"] = valid_s[-1]["end"]

    sess_data["_pilot_v2"] = True
    sess_data["_meta"] = {
        "alignment_engine": "continuous-faster-whisper-large-v3",
        "audio_duration": whisper_words[-1]["end"] if whisper_words else 0
    }

    out_path = f"courses/入中論善顯密意疏/sessions/session_{sid}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(sess_data, f, ensure_ascii=False, indent=2)

    print(f"Successfully wrote aligned session to {out_path}!")

if __name__ == "__main__":
    main()
