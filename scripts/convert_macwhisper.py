#!/usr/bin/env python3
"""
convert_macwhisper.py - Convert MacWhisper & Flyday exported transcripts into standard session.json format.
Supports filename patterns:
  1. YYYYMMDD[-A|-B] 入中論善顯密意疏-第六現前地pNN(X).MP3 / .txt
  2. YYYYMMDD_第六現前地_pNN_第X堂.MP3 / .txt
  3. Filter out redundant `*_seekable.mp3` ffmpeg variants.

Timestamp realignment (2026-08-13, fixes Issue #1):
- Uses ffprobe to read actual MP3 duration
- Re-scales synthetic 120s/8s timestamps proportionally to actual audio duration
"""

import sys
import re
import json
import os
import subprocess

# Seconds per paragraph (synthetic baseline)
SECS_PER_PARAGRAPH = 120.0
# Seconds per sentence step (synthetic baseline)
SECS_PER_SENTENCE_STEP = 8.0


def get_audio_duration(audio_path):
    """
    Use ffprobe to read actual MP3 audio duration in seconds.
    Returns None if ffprobe fails or file doesn't exist.
    """
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                audio_path,
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except (subprocess.TimeoutExpired, ValueError, FileNotFoundError):
        pass
    return None


def rescale_timestamps(paragraphs, actual_duration):
    """
    Re-scale synthetic timestamps (120s paragraphs, 8s sentence steps)
    proportionally to fit actual audio duration.

    Formula:
      scale_factor = actual_duration / (total_paragraphs * SECS_PER_PARAGRAPH)
      new_start = original_start * scale_factor

    Each sentence's start within a paragraph is mapped from
    (i / n_sentences) × SECS_PER_PARAGRAPH to the same fraction of
    actual duration per paragraph.
    """
    if not paragraphs or actual_duration is None or actual_duration <= 0:
        return paragraphs

    # Compute the synthetic total duration (sum of paragraph durations)
    # Original: each paragraph is SECS_PER_PARAGRAPH (with last possibly shorter)
    # We assume the structure is n paragraphs of SECS_PER_PARAGRAPH each
    # The actual JSON may have last paragraph end being slightly less,
    # but we scale by the ratio of actual vs. synthetic.
    n_paras = len(paragraphs)
    synthetic_total = n_paras * SECS_PER_PARAGRAPH
    if synthetic_total <= 0:
        return paragraphs
    scale_factor = actual_duration / synthetic_total

    for para in paragraphs:
        old_start = para.get("start", 0.0)
        old_end = para.get("end", 0.0)
        para["start"] = round(old_start * scale_factor, 2)
        para["end"] = round(old_end * scale_factor, 2)

        # Re-scale sentence timestamps
        for sent in para.get("sentences", []):
            old_s = sent.get("start", 0.0)
            old_e = sent.get("end", 0.0)
            sent["start"] = round(old_s * scale_factor, 2)
            sent["end"] = round(old_e * scale_factor, 2)

    return paragraphs


def parse_filename(filepath):
    filename = os.path.basename(filepath)

    # Skip seekable duplicate variants created by ffmpeg
    if "_seekable" in filename:
        print(f"Skipping duplicate seekable variant: {filename}")
        return None

    # Pattern 1: YYYYMMDD[-A|-B] Course-Section pNN(Num)
    pattern1 = r"(\d{4})(\d{2})(\d{2})[-_]?([AB])?\s*(.*?)[-_](.*?)(?:p|頁)(\d+)(?:\((\d+)\)|_第(\d+)堂)?"
    m1 = re.search(pattern1, filename)

    if m1:
        yyyy, mm, dd, sub, course, section, page, num1, num2 = m1.groups()
        num = num1 or num2 or "1"
        sub = sub or "A"
        session_id = f"{int(num):02d}{sub}"
        period_label = "上節" if sub == 'A' else "下節"

        return {
            "date": f"{yyyy}-{mm}-{dd}",
            "subSession": sub,
            "sessionNum": int(num),
            "sessionId": session_id,
            "pageRange": f"p.{page}",
            "periodLabel": period_label,
            "course": course.strip() if course else "入中論善顯密意疏",
            "section": section.strip() if section else "第六現前地"
        }

    return None


def convert_txt_to_session_json(txt_filepath, output_json_path, audio_filepath=None):
    meta = parse_filename(txt_filepath)
    if not meta:
        print(f"File {txt_filepath} skipped or unrecognized pattern.")
        return

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

    # Timestamp realignment (Issue #1 fix)
    if audio_filepath and os.path.exists(audio_filepath):
        actual_dur = get_audio_duration(audio_filepath)
        if actual_dur:
            paragraphs = rescale_timestamps(paragraphs, actual_dur)

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
        audio_arg = sys.argv[3] if len(sys.argv) >= 4 else None
        convert_txt_to_session_json(sys.argv[1], sys.argv[2], audio_arg)
    else:
        print("Usage: python3 convert_macwhisper.py <input.txt> <output_session.json> [audio.mp3]")