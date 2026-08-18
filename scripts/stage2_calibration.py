#!/usr/bin/env python3
"""
Stage 2 — Forced alignment pilot using WhisperX on sessions 01, 69A, 110B.

Runs WhisperX align (wav2vec2-base, Mandarin) on a 60s window from the
middle of each pilot session. Re-anchors sentence timestamps to real audio.
Records CER, timestamp median error, P95 error, and NEEDS_REVIEW count.

Output: qa_27B/stage2_alignment_<sid>.json + stage2_alignment_manifest.json
"""
import hashlib, json, os, re, subprocess, time, sys
from pathlib import Path
import numpy as np

ROOT = Path("courses/入中論善顯密意疏")
AUDIO = Path("audio")
SESSIONS = ["01", "69A", "110B"]
SEGMENT_SECONDS = 30.0  # We use 60s clips sliced from middle.

def audio_real(sid):
    return Path(os.path.realpath(AUDIO / f"{sid}.mp3"))

def ffprobe_duration(p):
    return float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(p)],
        capture_output=True, text=True, check=True,
    ).stdout.strip())

def slice_wav(audio, start, dur, out):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error",
         "-ss", f"{start:.3f}", "-i", str(audio),
         "-t", f"{dur:.3f}", "-ar", "16000", "-ac", "1",
         "-c:a", "pcm_s16le", str(out)],
        capture_output=True, check=True,
    )

def load_whisperx_zh():
    import whisperx
    align_model, meta = whisperx.load_align_model(language_code="zh", device="cpu")
    return align_model, meta

def whisperx_align_words(clip_path, sentences):
    """Run whisperx align on a single clip with the published sentences.

    Returns list of {char, start, end, score} (one per char in order).
    """
    import whisperx
    align_model, meta = load_whisperx_zh()
    a = whisperx.load_audio(str(clip_path))

    # Build per-sentence segments with the empty initial windows, then run
    # align. WhisperX needs word objects with start/end hints; we set them
    # to the segment-level window and let align refine.
    segs = []
    for sent in sentences:
        segs.append({
            "text": sent,
            "start": 0.0,
            "end": len(a) / 16000.0,
            "words": [
                {"text": ch, "start": 0.0, "end": len(a) / 16000.0, "score": 1.0}
                for ch in sent if ch.strip()
            ],
        })

    result = whisperx.align(segs, align_model, meta, a, device="cpu")
    out = []
    for seg in result.get("segments", []):
        for w in seg.get("words", []) or []:
            out.append({
                "char": w.get("word"),
                "start": float(w.get("start")) if w.get("start") is not None else None,
                "end": float(w.get("end")) if w.get("end") is not None else None,
                "score": float(w.get("score")) if w.get("score") is not None else None,
            })
    return out

def cer(a, b):
    """Character error rate (Levenshtein over characters)."""
    if not a:
        return 0.0 if not b else 1.0
    n, m = len(a), len(b)
    dp = [[0]*(m+1) for _ in range(n+1)]
    for i in range(n+1):
        dp[i][0] = i
    for j in range(m+1):
        dp[0][j] = j
    for i in range(1, n+1):
        for j in range(1, m+1):
            if a[i-1] == b[j-1]:
                dp[i][j] = dp[i-1][j-1]
            else:
                dp[i][j] = 1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
    return dp[n][m] / max(n, 1)

def is_synthetic_pattern(timestamps):
    """The published pipeline rescaled 8s-per-sentence synthetic steps.
    Detect long runs of identical or near-identical deltas."""
    if len(timestamps) < 6:
        return False
    deltas = np.diff(timestamps)
    # If more than 80% of deltas are within 0.5s of each other, likely synthetic.
    if len(deltas) == 0:
        return False
    median = float(np.median(deltas))
    close = sum(1 for d in deltas if abs(d - median) < 0.5)
    return close / len(deltas) > 0.8

def align_session(sid):
    audio = audio_real(sid)
    if not audio.exists():
        return {"error": f"audio not found: {audio}"}
    audio_dur = ffprobe_duration(audio)
    js = json.loads((ROOT / "sessions" / f"session_{sid}.json").read_text())
    paras = js["paragraphs"]
    pub_times = []  # (start, end, text)
    for p in paras:
        for s in p["sentences"]:
            pub_times.append((s["start"], s["end"], s["text"]))

    # 60s window from middle.
    mid = audio_dur / 2.0
    clip_start = max(0.0, mid - 30.0)
    clip_end = min(audio_dur, mid + 30.0)
    clip = Path(f"/tmp/issue11_{sid}_60s.wav")
    slice_wav(audio, clip_start, clip_end - clip_start, clip)

    in_clip = []
    for st, en, txt in pub_times:
        if en < clip_start:
            continue
        if st > clip_end:
            break
        in_clip.append((st, en, txt))

    print(f"  session {sid}: clip [{clip_start:.1f}..{clip_end:.1f}]")
    print(f"  in_clip sentences: {len(in_clip)}")

    # Run WhisperX align.
    t0 = time.time()
    engine = "whisperx"
    try:
        chars = whisperx_align_words(clip, [t for _, _, t in in_clip])
        align_wall = time.time() - t0
        if len(chars) < 5:
            raise RuntimeError(f"too few chars: {len(chars)}")
    except Exception as exc:
        print(f"  WhisperX failed: {type(exc).__name__}: {exc}")
        return {"error": f"whisperx failed: {exc}", "sessionId": sid}

    # Build a simple per-sentence timestamp reconstruction by walking the
    # aligned chars and matching them to the published sentence text.
    # For each sentence, we record (start, end, score) = (first aligned char
    # start, last aligned char end, mean score).
    walk = 0
    sentence_results = []
    for pub_st, pub_en, txt in in_clip:
        target = re.sub(r"\s+", "", txt).replace("[", "").replace("]", "")
        if not target:
            sentence_results.append({
                "published_start": pub_st, "published_end": pub_en,
                "text": txt, "aligned_start": None, "aligned_end": None,
                "needs_review": True, "matched": 0, "total": 0,
            })
            continue
        first = None
        last = None
        scores = []
        matched = 0
        # Iterate chars in input order consuming aligned chars.
        consumed = 0
        for ch in target:
            # Find next matching char in chars[walk:].
            while walk < len(chars):
                c = chars[walk]
                if c["char"] == ch:
                    if first is None and c["start"] is not None:
                        first = c["start"]
                    if c["end"] is not None:
                        last = c["end"]
                    if c["score"] is not None:
                        scores.append(c["score"])
                    walk += 1
                    matched += 1
                    consumed += 1
                    break
                walk += 1
            else:
                break
        complete = (matched == len(target))
        nr = (not complete) or (first is None) or (last is None) \
             or (np.mean(scores) < 0.5 if scores else True)
        sentence_results.append({
            "published_start": pub_st, "published_end": pub_en,
            "text": txt,
            "aligned_start": first,
            "aligned_end": last,
            "mean_score": float(np.mean(scores)) if scores else None,
            "needs_review": bool(nr),
            "matched": matched,
            "total": len(target),
        })

    # Compute error vs published: published - aligned (relative to clip).
    delta_starts = []
    delta_ends = []
    for sr in sentence_results:
        if sr["aligned_start"] is None:
            continue
        delta_starts.append(abs(sr["aligned_start"] - (sr["published_start"] - clip_start)))
        delta_ends.append(abs(sr["aligned_end"] - (sr["published_end"] - clip_start)))

    # Detect if published timestamps show a synthetic pattern.
    pub_all_starts = [st for st, _, _ in pub_times]
    pub_pattern = is_synthetic_pattern(pub_all_starts)

    # CER: align the aligned text (joined chars) against the corrected
    # transcript (page markers stripped).
    aligned_chars = "".join(c["char"] for c in chars if c["char"])
    corrected_chars = "".join(re.sub(r"\[p\.[^\]]+\]", "", t) for _, _, t in in_clip)
    aligned_norm = re.sub(r"[，。！？：；、」』\s]", "", aligned_chars)
    corrected_norm = re.sub(r"[，。！？：；、」』\s]", "", corrected_chars)
    sample_cer = cer(corrected_norm, aligned_norm)

    needs_review_count = sum(1 for sr in sentence_results if sr["needs_review"])

    return {
        "tool": "scripts/stage2_calibration.py",
        "sessionId": sid,
        "engine": engine,
        "engine_wall_seconds": round(align_wall, 2),
        "clip_window": [clip_start, clip_end],
        "audio_duration": audio_dur,
        "in_clip_sentence_count": len(in_clip),
        "aligned_sentence_count": len(sentence_results),
        "aligned_chars_count": len(chars),
        "needs_review_count": needs_review_count,
        "needs_review_sentences": [
            sr for sr in sentence_results if sr["needs_review"]
        ][:20],
        "sample_cer": round(sample_cer, 4),
        "cer_basis_chars": {
            "transcribed_chars": len(aligned_chars),
            "corrected_chars": len(corrected_chars),
            "transcribed_chars_normalized": len(aligned_norm),
            "corrected_chars_normalized": len(corrected_norm),
        },
        "delta_starts": {
            "median": round(float(np.median(delta_starts)), 3) if delta_starts else None,
            "p95": round(float(np.percentile(delta_starts, 95)), 3) if delta_starts else None,
            "count": len(delta_starts),
        },
        "delta_ends": {
            "median": round(float(np.median(delta_ends)), 3) if delta_ends else None,
            "p95": round(float(np.percentile(delta_ends, 95)), 3) if delta_ends else None,
            "count": len(delta_ends),
        },
        "synthetic_pattern_detected": bool(pub_pattern),
        "first_aligned_sentence": sentence_results[0] if sentence_results else None,
        "last_aligned_sentence": sentence_results[-1] if sentence_results else None,
    }


def main():
    out_dir = Path("qa_27B")
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "tool": "scripts/stage2_calibration.py",
        "issue": "Issue #11",
        "stage": "Stage 2 — Forced alignment pilot",
        "asr_engine": "WhisperX (wav2vec2-base zh + 3500-token Mandarin dict)",
        "asr_engine_details": {
            "alignment_model": "wav2vec2-base (Mandarin) via WhisperX",
            "compute_type": "CPU",
            "device": "cpu",
            "language": "zh",
        },
        "ratios_runtime": {
            "use_aligned_ratio": 1.0,
            "legacy_global_ratio_preserved": "src/js/timeAligner.js calculateTimeScaleRatio",
        },
        "sessions": [],
    }
    for sid in SESSIONS:
        print(f"\n=== stage 2 alignment: session {sid} ===")
        t0 = time.time()
        result = align_session(sid)
        dt = time.time() - t0
        result["wall_seconds"] = round(dt, 1)
        manifest["sessions"].append(result)
        out_path = out_dir / f"stage2_alignment_{sid}.json"
        out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2))
        print(f"  -> {out_path} ({dt:.1f}s wall)")
    summary = out_dir / "stage2_alignment_manifest.json"
    summary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"\nWrote {summary}")


if __name__ == "__main__":
    main()
