#!/usr/bin/env python3
"""
Stage 3c — Reproducibility check (Issue #11).

Re-runs the Stage 3b pipeline for session 01 ONLY and asserts the metrics
match the recorded stage3b_corrected_qa.json within tolerance.
Independent reviewer (xiaojian) runs this to confirm reproducibility.

Expected wall time: ~3-4 min (model load + 1 whisperx align + 1 fw transcribe).
"""
import json, sys, time
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

QA = ROOT / "qa_27B"
RECORDED = json.loads((QA / "stage3b_corrected_qa.json").read_text())
rec = next(s for s in RECORDED["sessions"] if s["sessionId"] == "01")

TOL_CER = 0.05      # CER is deterministic for fixed model+params; allow small
TOL_TS = 0.25       # seconds; forced alignment is deterministic on CPU

def main():
    # Reuse stage3b internals
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "s3b", ROOT / "scripts" / "stage3b_corrected_qa.py")
    s3b = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(s3b)

    import whisperx
    from faster_whisper import WhisperModel
    from opencc import OpenCC
    s2t = OpenCC("s2t")

    sid = "01"
    clip_start = rec["clip_window"][0]
    import os
    audio = os.path.realpath(str(s3b.AUDIO / f"{sid}.mp3"))
    sents = s3b.load_sents(sid)

    clip_wav = Path(f"/tmp/repro_{sid}.wav")
    s3b.slice_wav(audio, clip_start, s3b.CLIP, clip_wav)
    in_clip = [(s["start"], s["end"], s["text"])
               for s in sents
               if s["end"] > clip_start and s["start"] < clip_start + s3b.CLIP]

    align_model, meta = whisperx.load_align_model(language_code="zh", device="cpu")
    a = whisperx.load_audio(str(clip_wav))
    segs = [{"text": t, "start": 0.0, "end": s3b.CLIP,
             "words": [{"text": ch, "start": 0.0, "end": s3b.CLIP, "score": 1.0}
                       for ch in t if ch.strip()]}
            for _, _, t in in_clip]
    t0 = time.time()
    res = whisperx.align(segs, align_model, meta, a, device="cpu")
    aligned = res.get("segments", segs)
    corrected = [{"abs_start": clip_start + al.get("start", 0.0), "text": txt}
                 for (st, en, txt), al in zip(in_clip, aligned)]
    win_text = "".join(c["text"] for c in corrected)
    win_starts = [c["abs_start"] - clip_start for c in corrected]
    print(f"whisperx re-align: {time.time()-t0:.1f}s")

    model = WhisperModel("small", device="cpu", compute_type="int8")
    t0 = time.time()
    segments, _ = model.transcribe(str(clip_wav), language="zh",
                                   word_timestamps=True, beam_size=5)
    asr_text, asr_starts = "", []
    for seg in segments:
        if seg.words:
            for w in seg.words:
                asr_text += w.word.strip()
                asr_starts.append(w.start)
        else:
            asr_text += seg.text.strip()
    asr_text = s2t.convert(asr_text)
    print(f"faster-whisper: {time.time()-t0:.1f}s")

    cer_new = s3b.cer(win_text, asr_text)
    ts_errs = [min(abs(w - ps) for w in asr_starts) for ps in win_starts]
    ts_med_new = float(np.median(ts_errs))

    print(f"\nrecorded: CER={rec['text_cer_corrected']} ts_med={rec['ts_median_corrected']}")
    print(f"repro:    CER={cer_new:.4f} ts_med={ts_med_new:.3f}")

    ok_cer = abs(cer_new - rec["text_cer_corrected"]) <= TOL_CER
    ok_ts = abs(ts_med_new - rec["ts_median_corrected"]) <= TOL_TS
    reproducible = ok_cer and ok_ts
    print(f"\nreproducible: {reproducible} (cer_ok={ok_cer}, ts_ok={ok_ts})")

    out = QA / "stage3c_repro_check.json"
    out.write_text(json.dumps({
        "sessionId": sid,
        "recorded": {"cer": rec["text_cer_corrected"], "ts_med": rec["ts_median_corrected"]},
        "reproduced": {"cer": round(cer_new, 4), "ts_med": round(ts_med_new, 3)},
        "tolerances": {"cer": TOL_CER, "ts_sec": TOL_TS},
        "reproducible": reproducible,
    }, ensure_ascii=False, indent=2))
    print(f"-> {out}")
    return 0 if reproducible else 1

if __name__ == "__main__":
    sys.exit(main())
