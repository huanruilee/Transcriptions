#!/usr/bin/env python3
"""
Stage 3 — Independent ASR cross-validation (Issue #11).
Method: faster-whisper small int8 zh as independent engine.
3 sessions × 5 regions (head/middle/tail/dense/difficult) × 60s.
Computes: text_cer, timestamp median/p95 error, terminology errors.
Output: qa_27B/stage3_independent_qa.json
"""
import json, os, re, subprocess, time, sys
from pathlib import Path
from difflib import SequenceMatcher

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "audio"
COURSES = ROOT / "courses/入中論善顯密意疏/sessions"
OUT = ROOT / "qa_27B"
OUT.mkdir(exist_ok=True)
TMP = Path("/tmp/stage3_qa")
TMP.mkdir(exist_ok=True)

SESSIONS = ["01", "69A", "110B"]
DURATIONS = {"01": 2465.67, "69A": 3256.89, "110B": 3246.71}
CLIP = 60.0

BUDDHIST_TERMS = [
    "龍樹", "般若", "波羅蜜", "中觀", "空性", "二諦",
    "世俗諦", "勝義諦", "現前地", "離垢地", "善顯", "密意",
    "歸敬", "頌", "持戒", "增勝", "見道", "修道",
]

def slice_wav(audio_path, start, dur, out_path):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error",
         "-ss", f"{start:.3f}", "-i", str(audio_path),
         "-t", f"{dur:.3f}", "-ar", "16000", "-ac", "1",
         "-c:a", "pcm_s16le", str(out_path)],
        capture_output=True, check=True,
    )

def load_sessions(sid):
    """Return flat list of sentences with absolute start/end/text."""
    data = json.loads((COURSES / f"session_{sid}.json").read_text())
    sents = []
    for para in data["paragraphs"]:
        for s in para.get("sentences", []):
            txt = re.sub(r'\[p\.\d+\]\s*', '', s["text"]).strip()
            if txt:
                sents.append({"start": s["start"], "end": s["end"], "text": txt})
    return sents

def find_dense_region(sents, dur):
    """Find 60s window with most Buddhist-term characters."""
    best_start, best_count = 0, 0
    # Scan every 30s step
    for t in range(0, int(dur) - int(CLIP), 30):
        text = "".join(s["text"] for s in sents if s["start"] >= t and s["start"] < t + CLIP)
        count = sum(text.count(term) for term in BUDDHIST_TERMS)
        if count > best_count:
            best_count = count
            best_start = t
    return best_start

def find_difficult_region(sents, dur):
    """Find 60s window with most filler words (嗯/啊/對吧/是吧)."""
    fillers = ["嗯", "啊", "對吧", "是吧", "對", "哦", "喔"]
    best_start, best_count = 0, 0
    for t in range(0, int(dur) - int(CLIP), 30):
        text = "".join(s["text"] for s in sents if s["start"] >= t and s["start"] < t + CLIP)
        count = sum(text.count(f) for f in fillers)
        if count > best_count:
            best_count = count
            best_start = t
    return best_start

def char_error_rate(ref, hyp):
    """Character-level edit distance ratio (punctuation/whitespace removed)."""
    def clean(s):
        return [c for c in s if c.isalnum() or '\u4e00' <= c <= '\u9fff']
    ref_c = clean(ref)
    hyp_c = clean(hyp)
    if not ref_c and not hyp_c:
        return 0.0
    if not ref_c or not hyp_c:
        return 1.0
    sm = SequenceMatcher(None, ref_c, hyp_c)
    return 1.0 - sm.ratio()

def main():
    from faster_whisper import WhisperModel
    from opencc import OpenCC
    s2t = OpenCC("s2t")
    print("Loading faster-whisper small int8 (CPU)...", flush=True)
    t0 = time.time()
    model = WhisperModel("small", device="cpu", compute_type="int8")
    print(f"  Model loaded in {time.time()-t0:.1f}s", flush=True)

    results = {"issue": "Issue #11", "stage": "Stage 3 — Independent QA",
               "engine": "faster-whisper small int8 (CPU)",
               "method": "Independent ASR cross-validation",
               "wall_seconds": None, "sessions": []}
    T0 = time.time()

    for sid in SESSIONS:
        audio = os.path.realpath(str(AUDIO / f"{sid}.mp3"))
        dur = DURATIONS[sid]
        sents = load_sessions(sid)
        print(f"\n=== Session {sid} ({dur:.0f}s, {len(sents)} sents) ===", flush=True)

        # Determine 5 regions
        dense_start = find_dense_region(sents, dur)
        diff_start = find_difficult_region(sents, dur)
        mid_start = int(dur * 0.5) - 30
        regions = {
            "head": 0.0,
            "middle": float(mid_start),
            "tail": dur - CLIP,
            "dense_buddhist": float(dense_start),
            "difficult": float(diff_start),
        }

        session_result = {"sessionId": sid, "audio_duration": dur,
                          "sentence_count": len(sents), "regions": []}

        for region_name, start in regions.items():
            tag = f"stage3_{sid}_{region_name}"
            wav_path = TMP / f"{tag}.wav"
            slice_wav(audio, start, CLIP, wav_path)

            # Transcribe
            segments, info = model.transcribe(
                str(wav_path), language="zh",
                word_timestamps=True, beam_size=5,
            )
            asr_text = ""
            asr_word_starts = []
            for seg in segments:
                if seg.words:
                    for w in seg.words:
                        asr_text += w.word.strip()
                        asr_word_starts.append(w.start)
                else:
                    asr_text += seg.text.strip()
            # faster-whisper outputs simplified; convert to traditional
            # for fair comparison with published traditional text.
            asr_text = s2t.convert(asr_text)

            # Published text in this window
            pub_sents = [s for s in sents if s["start"] >= start and s["start"] < start + CLIP]
            pub_text = "".join(s["text"] for s in pub_sents)
            pub_starts = [s["start"] - start for s in pub_sents]

            # Text CER
            cer = char_error_rate(pub_text, asr_text)

            # Timestamp error (compare sentence starts)
            ts_errors = []
            if pub_sents and asr_word_starts:
                # For each published sentence start, find nearest ASR word start
                for ps in pub_starts:
                    if asr_word_starts:
                        min_d = min(abs(w - ps) for w in asr_word_starts)
                        ts_errors.append(min_d)
            ts_median = sorted(ts_errors)[len(ts_errors)//2] if ts_errors else None
            ts_p95 = sorted(ts_errors)[min(int(len(ts_errors)*0.95), len(ts_errors)-1)] if ts_errors else None

            # Terminology check: check if Buddhist terms in published text
            # are present in ASR text
            term_errors = []
            for term in BUDDHIST_TERMS:
                if term in pub_text and term not in asr_text:
                    term_errors.append(term)

            # Verdict per region
            if cer >= 0.30:
                verdict = "STOP"
            elif cer >= 0.15 or (ts_median is not None and ts_median >= 30):
                verdict = "ADJUST"
            elif cer < 0.15 and (ts_median is None or ts_median < 15):
                verdict = "GO"
            else:
                verdict = "ADJUST"

            region_result = {
                "region": region_name,
                "window": [start, start + CLIP],
                "text_cer": round(cer, 4),
                "ts_median": round(ts_median, 2) if ts_median is not None else None,
                "ts_p95": round(ts_p95, 2) if ts_p95 is not None else None,
                "terminology_errors": term_errors,
                "verdict": verdict,
                "pub_chars": len(pub_text),
                "asr_chars": len(asr_text),
                "pub_sents": len(pub_sents),
                "sample_pub": pub_text[:100],
                "sample_asr": asr_text[:100],
            }
            session_result["regions"].append(region_result)
            print(f"  {region_name:16s} [{start:6.0f}-{start+CLIP:6.0f}] "
                  f"CER={cer:.3f} ts_med={ts_median if ts_median else '-':>5} "
                  f"terms_missed={term_errors} verdict={verdict}", flush=True)

        results["sessions"].append(session_result)

    results["wall_seconds"] = round(time.time() - T0, 1)

    # Overall verdict
    all_cers = [r["text_cer"] for s in results["sessions"] for r in s["regions"]]
    all_ts = [r["ts_median"] for s in results["sessions"] for r in s["regions"] if r["ts_median"] is not None]
    all_terms = [t for s in results["sessions"] for r in s["regions"] for t in r["terminology_errors"]]

    if any(c >= 0.30 for c in all_cers):
        overall = "STOP"
    elif any(c >= 0.15 for c in all_cers) or any(t >= 30 for t in all_ts):
        overall = "ADJUST"
    elif all(c < 0.15 for c in all_cers) and all(t < 15 for t in all_ts):
        overall = "GO"
    else:
        overall = "ADJUST"

    results["overall_verdict"] = overall
    results["summary"] = {
        "avg_text_cer": round(sum(all_cers)/len(all_cers), 4) if all_cers else None,
        "max_text_cer": round(max(all_cers), 4) if all_cers else None,
        "avg_ts_median": round(sum(all_ts)/len(all_ts), 2) if all_ts else None,
        "max_ts_median": round(max(all_ts), 2) if all_ts else None,
        "total_terminology_errors": len(all_terms),
        "terminology_errors_list": all_terms[:20],
    }

    out_path = OUT / "stage3_independent_qa.json"
    out_path.write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(f"\n=== DONE in {results['wall_seconds']}s ===")
    print(f"Overall verdict: {overall}")
    print(f"Avg CER: {results['summary']['avg_text_cer']}, Max CER: {results['summary']['max_text_cer']}")
    print(f"Avg ts_median: {results['summary']['avg_ts_median']}s, Max: {results['summary']['max_ts_median']}s")
    print(f"Term errors: {len(all_terms)}")
    print(f"-> {out_path}")

if __name__ == "__main__":
    main()
