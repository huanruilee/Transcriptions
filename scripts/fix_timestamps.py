#!/usr/bin/env python3
"""
fix_timestamps.py - Issue #1 fix: Re-scale all existing session JSON timestamps
proportionally to actual MP3 audio duration using ffprobe.

For each session_XX.json in courses/入中論善顯密意疏/sessions/:
  1. Read the corresponding audio/XX.mp3 actual duration via ffprobe
  2. Compute scale_factor = actual_duration / synthetic_total
     where synthetic_total = n_paragraphs * 120
  3. Re-scale every paragraph.start/end and sentence.start/end
  4. Verify: max(end) ≈ actual_duration

Usage:
  python3 fix_timestamps.py [--dry-run]
"""

import sys
import json
import os
import subprocess
import argparse
import glob

SYNTHETIC_PARAGRAPH_DURATION = 120.0  # seconds (baseline used in original generation)


def get_audio_duration(audio_path):
    """Use ffprobe to read actual MP3 audio duration in seconds."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                audio_path,
            ],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except (subprocess.TimeoutExpired, ValueError, FileNotFoundError):
        pass
    return None


def rescale_session(session_data, actual_duration):
    """Re-scale synthetic timestamps to fit actual audio duration.

    Returns (scale_factor, new_max_end).
    Mutates session_data in place.
    """
    paragraphs = session_data.get("paragraphs", [])
    if not paragraphs or actual_duration is None or actual_duration <= 0:
        return 0.0, 0.0

    n_paras = len(paragraphs)
    synthetic_total = n_paras * SYNTHETIC_PARAGRAPH_DURATION
    if synthetic_total <= 0:
        return 0.0, 0.0

    scale_factor = actual_duration / synthetic_total

    for para in paragraphs:
        para["start"] = round(para.get("start", 0.0) * scale_factor, 2)
        para["end"] = round(para.get("end", 0.0) * scale_factor, 2)
        for sent in para.get("sentences", []):
            sent["start"] = round(sent.get("start", 0.0) * scale_factor, 2)
            sent["end"] = round(sent.get("end", 0.0) * scale_factor, 2)

    return scale_factor, paragraphs[-1]["end"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Report what would change without writing")
    parser.add_argument("--course-dir", default="courses/入中論善顯密意疏",
                        help="Course directory containing sessions/")
    parser.add_argument("--audio-dir", default="audio",
                        help="Audio directory")
    args = parser.parse_args()

    sessions_dir = os.path.join(args.course_dir, "sessions")
    session_files = sorted(glob.glob(os.path.join(sessions_dir, "session_*.json")))
    print(f"Found {len(session_files)} session files")

    n_changed = 0
    n_skipped = 0
    n_failed = 0

    for sf in session_files:
        sid = os.path.basename(sf).replace("session_", "").replace(".json", "")
        audio_path = os.path.join(args.audio_dir, f"{sid}.mp3")

        actual = get_audio_duration(audio_path)
        if actual is None:
            print(f"  ✗ {sid}: audio not found or ffprobe failed ({audio_path})")
            n_failed += 1
            continue

        try:
            with open(sf, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"  ✗ {sid}: failed to read JSON ({e})")
            n_failed += 1
            continue

        paragraphs = data.get("paragraphs", [])
        if not paragraphs:
            n_skipped += 1
            continue

        old_max = paragraphs[-1].get("end", 0.0)
        scale, new_max = rescale_session(data, actual)

        diff_new = abs(new_max - actual)
        diff_old = abs(old_max - actual)
        ok = diff_new < 1.0

        if diff_old < 1.0:
            # Already matches actual — no work needed
            n_skipped += 1
            status = "✓"
        else:
            # Needs rescaling — write to disk unless --dry-run
            if not args.dry_run:
                with open(sf, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
            n_changed += 1
            status = "✓" if ok else "✗"

        print(f"  {status} {sid}: actual={actual:.2f}s, old_max={old_max:.2f}s → new_max={new_max:.2f}s (scale={scale:.4f})")

    print(f"\nSummary: {n_changed} changed, {n_skipped} unchanged, {n_failed} failed")
    return 0 if n_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())