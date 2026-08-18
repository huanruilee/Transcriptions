#!/usr/bin/env python3
"""
Stage 3b — Corrected-window cross-validation (Issue #11).

Stage 3 (baseline) exposed the root cause: published synthetic timestamps
are offset ~30-57s from real audio, so comparing ASR against the published
text window at the PUBLISHED offset is circular and inflates CER.

This script closes the loop:
  1. Re-run WhisperX alignment on the SAME 60s middle clip per session
     (Stage 2 window) to obtain REAL aligned timestamps.
  2. Build the corrected text window: published sentences whose REAL
     (aligned) position falls inside the clip.
  3. Transcribe the same clip with faster-whisper small (independent
     engine), s2t, and compute CER + timestamp error against the
     CORRECTED window.

This measures the pipeline that would actually ship:
  real aligned timestamps + corrected text.
"""
import json, os, re, subprocess, time
from pathlib import Path
from difflib import SequenceMatcher
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "audio"
COURSES = ROOT / "courses/入中論善顯密意疏/sessions"
QA = ROOT / "qa_27B"
OUT = QA / "stage3b_corrected_qa.json"

SESSIONS = ["01", "69A", "110B"]
CLIP = 60.0

def slice_wav(audio, start, dur, out):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.3f}",
         "-i", str(audio), "-t", f"{dur:.3f}", "-ar", "16000", "-ac", "1",
         "-c:a", "pcm_s16le", str(out)], capture_output=True, check=True)

def load_sents(sid):
    data = json.loads((COURSES / f"session_{sid}.json").read_text())
    sents = []
    for para in data["paragraphs"]:
        for s in para.get("sentences", []):
            txt = re.sub(r'\[p\.\d+\]\s*', '', s["text"]).strip()
            if txt:
                sents.append({"start": s["start"], "end": s["end"], "text": txt})
    return sents

def clean_chars(s):
    return [c for c in s if c.isalnum() or '\u4e00' <= c <= '\u9fff']

def cer(ref, hyp):
    r, h = clean_chars(ref), clean_chars(hyp)
    if not r and not h: return 0.0
    if not r or not h: return 1.0
    return 1.0 - SequenceMatcher(None, r, h).ratio()

def main():
    import whisperx
    from faster_whisper import WhisperModel
    from opencc import OpenCC
    s2t = OpenCC("s2t")

    print("Loading whisperx align (zh) + faster-whisper small...", flush=True)
    align_model, meta = whisperx.load_align_model(language_code="zh", device="cpu")
    model = WhisperModel("small", device="cpu", compute_type="int8")

    results = {"issue": "Issue #11", "stage": "Stage 3b — corrected-window cross-validation",
               "method": ("WhisperX real-aligned timestamps define the window; "
                          "independent faster-whisper small transcript compared "
                          "to corrected window text"),
               "sessions": []}
    T0 = time.time()

    for sid in SESSIONS:
        base = json.loads((QA / f"stage2_alignment_{sid}.json").read_text())
        clip_start = base["clip_window"][0]
        audio = os.path.realpath(str(AUDIO / f"{sid}.mp3"))
        sents = load_sents(sid)
        print(f"\n=== {sid}: clip [{clip_start:.1f}..{clip_start+CLIP:.1f}] ===", flush=True)

        # 1. Re-align (same window as Stage 2) to get real timestamps
        clip_wav = Path(f"/tmp/stage3b_{sid}.wav")
        slice_wav(audio, clip_start, CLIP, clip_wav)
        in_clip = [(s["start"], s["end"], s["text"])
                   for s in sents
                   if s["end"] > clip_start and s["start"] < clip_start + CLIP]
        t0 = time.time()
        a = whisperx.load_audio(str(clip_wav))
        segs = []
        for _, _, t in in_clip:
            segs.append({
                "text": t,
                "start": 0.0,
                "end": CLIP,
                "words": [{"text": ch, "start": 0.0, "end": CLIP, "score": 1.0}
                          for ch in t if ch.strip()],
            })
        res = whisperx.align(segs, align_model, meta, a, device="cpu")
        aligned = res.get("segments", segs)
        # map aligned start/end back to absolute
        corrected = []
        for (st, en, txt), al in zip(in_clip, aligned):
            corrected.append({
                "abs_start": clip_start + al.get("start", 0.0),
                "abs_end": clip_start + al.get("end", 0.0),
                "text": txt,
            })
        print(f"  whisperx re-align: {time.time()-t0:.1f}s, {len(corrected)} sentences", flush=True)

        # 2. Corrected window text = sentences whose REAL position is inside clip
        win_text = "".join(c["text"] for c in corrected)
        win_starts = [c["abs_start"] - clip_start for c in corrected]

        # 3. Independent ASR of same clip
        t0 = time.time()
        segments, _ = model.transcribe(str(clip_wav), language="zh",
                                       word_timestamps=True, beam_size=5)
        asr_text, asr_starts = "", []
        for seg in segments:
            if seg.words:
                for w in seg.words:
                    asr_text += w.word.strip()
                    asr_word = w.word.strip()
                    asr_starts.append(w.start)
            else:
                asr_text += seg.text.strip()
        asr_text = s2t.convert(asr_text)
        print(f"  faster-whisper: {time.time()-t0:.1f}s", flush=True)

        text_cer = cer(win_text, asr_text)
        ts_errs = [min(abs(w - ps) for w in asr_starts) for ps in win_starts] if asr_starts else []
        ts_med = float(np.median(ts_errs)) if ts_errs else None
        ts_p95 = float(np.percentile(ts_errs, 95)) if ts_errs else None

        # Term errors: terms in corrected window text missing from ASR
        terms = ["龍樹", "般若", "波羅蜜", "中觀", "空性", "二諦", "世俗諦",
                 "勝義諦", "現前地", "離垢地", "善顯", "密意", "歸敬", "見道", "修道"]
        term_missed = [t for t in terms if t in win_text and t not in asr_text]

        r = {
            "sessionId": sid,
            "clip_window": [clip_start, clip_start + CLIP],
            "sentences_in_corrected_window": len(corrected),
            "text_cer_corrected": round(text_cer, 4),
            "ts_median_corrected": round(ts_med, 3) if ts_med is not None else None,
            "ts_p95_corrected": round(ts_p95, 3) if ts_p95 is not None else None,
            "terminology_missed_in_asr": term_missed,
            "sample_corrected": win_text[:120],
            "sample_asr": asr_text[:120],
        }
        results["sessions"].append(r)
        print(f"  CER(corrected)={text_cer:.3f} ts_med={ts_med:.2f}s ts_p95={ts_p95:.2f}s terms_missed={term_missed}", flush=True)

    results["wall_seconds"] = round(time.time() - T0, 1)
    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2))
    cers = [s["text_cer_corrected"] for s in results["sessions"]]
    meds = [s["ts_median_corrected"] for s in results["sessions"] if s["ts_median_corrected"] is not None]
    print(f"\n=== DONE {results['wall_seconds']}s ===")
    print(f"corrected CER: {cers} | ts_med: {meds}")
    print(f"-> {OUT}")

if __name__ == "__main__":
    main()
