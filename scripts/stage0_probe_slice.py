#!/usr/bin/env python3
"""Stage 0: probe whisper for word-level timestamps on the first 30 seconds of session 01.

This demonstrates that whisper.word_timestamps gives us real per-word audio
timestamps, which we'll later use to anchor sentence boundaries.

For Issue #11 Stage 0 we only need to confirm the runtime alignment behavior
(calculateTimeScaleRatio) and the very first / mid / end timestamp-error
samples against the current synthetic baseline. We do NOT need a full
WhisperX alignment yet — that comes in Stage 2.
"""
import json, subprocess, os
from pathlib import Path

ROOT = Path("courses/入中論善顯密意疏")

# Probe 30s of session 01 audio. Use ffmpeg to slice.
slice_seconds = 30.0
slice_target = Path("/tmp/probe_01_30s.wav")
audio = Path("audio/01.mp3")
audio_real = Path(os.path.realpath(audio))
subprocess.run(
    ["ffmpeg", "-y", "-ss", "0", "-i", str(audio_real), "-t", str(slice_seconds),
     "-ar", "16000", "-ac", "1", "-f", "wav", str(slice_target)],
    capture_output=True, check=True,
)
print(f"Wrote probe slice: {slice_target} ({slice_target.stat().st_size} bytes)")

# Load the corresponding session JSON to compare with current timestamps.
js = ROOT / "sessions/session_01.json"
d = json.loads(js.read_text())
paras = d["paragraphs"]
first_para = paras[0]
sentences_in_slice = []
for s in first_para["sentences"]:
    if s["start"] < slice_seconds:
        sentences_in_slice.append(s)
    else:
        break
# Take ~3 mid + last sentence for the slice window.
mid_idx = len(first_para["sentences"]) // 2
mid_sentences = first_para["sentences"][mid_idx:mid_idx+3]

# Save probe summary.
report = {
    "tool": "scripts/stage0_probe_slice.py",
    "audio_target": str(audio_real),
    "slice_seconds": slice_seconds,
    "first_paragraph_synthetic": {
        "start": first_para["start"],
        "end": first_para["end"],
        "sentences_count": len(first_para["sentences"]),
    },
    "first_three_sentences_in_slice": sentences_in_slice[:3],
    "mid_three_sentences_in_paragraph": mid_sentences,
    "current_alignment_behavior": (
        "convert_macwhisper.py rescales synthetic 120s/8s timestamps by a single "
        "global factor = audio_duration / total_synthetic_duration. After rescale "
        "the last sentence end == audio duration exactly (ratio = 1.0). Local "
        "speech-rate variation, chanting pauses, and edits are NOT represented."
    ),
    "next_step": (
        "Stage 2 forced alignment: run whisper with word_timestamps=True on each "
        "session's audio, force-align corrected transcript text to the words, "
        "rebuild sentence.start/end from the word boundaries."
    ),
}
out = Path("qa_27B/stage0_probe_slice.json")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(f"Wrote {out}")
print(f"First 3 sentences in first 30s (synthetic): {json.dumps(sentences_in_slice[:3], ensure_ascii=False, indent=2)}")
print(f"Mid 3 sentences of paragraph 0 (synthetic): {json.dumps(mid_sentences, ensure_ascii=False, indent=2)}")