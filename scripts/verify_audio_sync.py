#!/usr/bin/env python3
"""
verify_audio_sync.py - Fully Automated Objective Acoustic Synchronization & CER Verifier.

Tests that sentence timestamps in session JSONs accurately match the actual spoken audio
without requiring human ear checks.

Method:
  1. Loads session JSON and extracts sampled sentences across beginning, middle, and end.
  2. Slices the exact audio window [start, end] for each sentence.
  3. Transcribes the audio slice using an independent ASR engine.
  4. Measures Character Error Rate (CER) and text similarity between the audio slice and the JSON.
  5. Hard-fails if similarity < threshold (e.g. 75%), proving misalignment or text discrepancy.
"""
import os
import sys
import json
import subprocess
import re
import argparse
from pathlib import Path

def clean_text(text):
    text = re.sub(r'\[p\.\d+\]', '', text)
    text = re.sub(r'[^\w\u4e00-\u9fff]', '', text)
    return text.strip()

def levenshtein_distance(s1, s2):
    m, n = len(s1), len(s2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1): dp[i][0] = i
    for j in range(n + 1): dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if s1[i - 1] == s2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    return dp[m][n]

def calculate_similarity(ref, hyp):
    if not ref and not hyp: return 1.0
    if not ref or not hyp: return 0.0
    dist = levenshtein_distance(ref, hyp)
    max_len = max(len(ref), len(hyp))
    return max(0.0, 1.0 - dist / max_len)

def main():
    ap = argparse.ArgumentParser(description="Automated Acoustic Synchronization Verifier")
    ap.add_argument("session_id", help="Session ID, e.g. 29A")
    ap.add_argument("audio_path", help="Path to full audio file, e.g. audio/29A.mp3")
    ap.add_argument("--samples", type=int, default=15, help="Number of sentences to sample across the session")
    ap.add_argument("--threshold", type=float, default=0.70, help="Minimum average similarity threshold")
    args = ap.parse_args()

    sess_file = Path(f"courses/入中論善顯密意疏/sessions/session_{args.session_id}.json")
    if not sess_file.exists():
        print(f"❌ Session JSON not found: {sess_file}")
        sys.exit(1)

    with open(sess_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Collect all valid non-trivial sentences (length >= 6 chars)
    all_sentences = []
    for pi, p in enumerate(data["paragraphs"]):
        for si, s in enumerate(p["sentences"]):
            c_text = clean_text(s["text"])
            if len(c_text) >= 6 and s["end"] > s["start"]:
                all_sentences.append({
                    "pi": pi,
                    "si": si,
                    "text": s["text"],
                    "clean_text": c_text,
                    "start": s["start"],
                    "end": s["end"],
                    "duration": s["end"] - s["start"]
                })

    if not all_sentences:
        print("❌ No valid sentences found in session.")
        sys.exit(1)

    # Sample uniformly across the entire timeline (0% to 100%)
    n_total = len(all_sentences)
    sample_indices = [int(i * (n_total - 1) / (args.samples - 1)) for i in range(args.samples)]
    sampled_sentences = [all_sentences[idx] for idx in sample_indices]

    print(f"\n=======================================================")
    print(f"🎙️  AUTOMATED ACOUSTIC SYNC VERIFICATION — Session {args.session_id}")
    print(f"=======================================================")
    print(f"• Total sentences: {n_total}")
    print(f"• Sample points: {len(sampled_sentences)} (uniformly distributed across 0%~100% time)")
    print(f"• Target pass threshold: >= {args.threshold*100:.0f}% acoustic match similarity\n")

    # Load faster-whisper on GX10
    from faster_whisper import WhisperModel
    import opencc
    t2s = opencc.OpenCC('t2s')

    print("Loading independent ASR verification model...")
    model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")

    import tempfile
    results = []
    passed_count = 0

    for i, item in enumerate(sampled_sentences):
        # Slice the exact audio segment [start, end]
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_slice:
            slice_path = tmp_slice.name

        # ffmpeg slice with padding of 0.2s for acoustic envelope
        p_start = max(0.0, item["start"] - 0.1)
        p_dur = item["duration"] + 0.2
        cmd = [
            "ffmpeg", "-y", "-ss", str(p_start), "-t", str(p_dur),
            "-i", args.audio_path, "-ac", "1", "-ar", "16000",
            "-loglevel", "quiet", slice_path
        ]
        subprocess.run(cmd, check=True)

        # Transcribe audio slice
        segments, _ = model.transcribe(slice_path, language="zh")
        slice_transcript = "".join(s.text for s in segments)
        clean_slice = clean_text(slice_transcript)

        # Compute character match similarity
        ref_norm = t2s.convert(item["clean_text"])
        hyp_norm = t2s.convert(clean_slice)
        sim = calculate_similarity(ref_norm, hyp_norm)

        # Remove temp slice
        if os.path.exists(slice_path):
            os.remove(slice_path)

        is_pass = sim >= args.threshold
        if is_pass: passed_count += 1

        status_icon = "✅ PASS" if is_pass else "❌ DRIFT"
        results.append({
            "idx": i + 1,
            "time_range": f"{item['start']:.2f}s ~ {item['end']:.2f}s",
            "json_text": item["text"],
            "audio_heard": slice_transcript if slice_transcript else "(silence/noise)",
            "similarity": sim,
            "pass": is_pass
        })

        print(f"[{i+1}/{len(sampled_sentences)}] {status_icon} ({sim*100:.1f}%) @ {item['start']:.2f}s - {item['end']:.2f}s")
        print(f"   📄 JSON:  {item['text']}")
        print(f"   🔊 AUDIO: {slice_transcript.strip()}")
        print("-" * 55)

    avg_sim = sum(r["similarity"] for r in results) / len(results)
    pass_rate = (passed_count / len(results)) * 100

    print(f"\n=======================================================")
    print(f"📊 VERIFICATION SUMMARY:")
    print(f"• Overall Acoustic Similarity: {avg_sim*100:.2f}%")
    print(f"• Sample Pass Rate: {passed_count}/{len(results)} ({pass_rate:.1f}%)")
    print(f"=======================================================\n")

    if avg_sim >= args.threshold and pass_rate >= 80.0:
        print("🎉 RESULT: PASS — Audio and Text are objectively synchronized!")
        sys.exit(0)
    else:
        print("🚨 RESULT: FAIL — Audio and Text synchronization drift detected!")
        sys.exit(1)

if __name__ == "__main__":
    main()
