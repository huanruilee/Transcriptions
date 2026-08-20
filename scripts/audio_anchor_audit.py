#!/usr/bin/env python3
"""Audio-grounded sentence-ANCHOR audit (Issue #11 v2 — sole audio acceptance).

WHY THIS IS "AUDIO-CAPABLE" (and what it honestly is / is not)
------------------------------------------------------------
The reviewer demanded: complete an audio-capable *sentence-anchor* review and
stop using a full-audio ASR proxy as a substitute for real-audio acceptance.

A *sentence anchor* is the claim that the audio segment `[start, end]`
carried by sentence N actually contains sentence N's spoken content (i.e. the
timestamp is audio-grounded, not just a coarse 8s/120s legacy step).

This script tests exactly that, per sentence, on the REAL audio:

  1. Read sentence N's audio-grounded [start, end] from the aligned pilot
     JSON (the wav2vec2 timestamps under test).
  2. Extract audio[start:end] from the actual mp3 with ffmpeg -> PCM wav.
  3. Run an INDEPENDENT faster-whisper (no forced text) on that segment.
  4. Compare the segment's ASR text to:
        - its OWN published sentence (own_cer)
        - the PREVIOUS published sentence (prev_cer)
        - the NEXT published sentence (next_cer)
  5. anchor_ok(N)  :=  own_cer <= prev_cer  AND  own_cer <= next_cer

If the timestamp is correct, the audio in [start,end] matches sentence N, so
own_cer is the smallest. If the timestamp is mis-anchored (off by a sentence),
a neighbour's CER beats the own CER. This relative comparison is robust to
ASR noise (the thing that makes absolute CER on short clips unreliable) and
is the clean audio-grounded anchor signal.

Honest labelling (carried in the output so nobody over-claims):
  - is_audio_grounded : True   (real audio segments are used)
  - is_human_ear_review : False (this is a machine ASR anchor check, NOT a
                                 human listening; final text-accuracy /
                                 Buddhist-term acceptance still needs ears)
  - is_go_gate : False by itself; it is a required *technical* precondition.

Verdict scale (per session):
  GO      anchor_rate >= 0.90  AND  timestamps monotonic
  ADJUST  0.70 <= anchor_rate < 0.90
  STOP    anchor_rate < 0.70
"""
from __future__ import annotations
import argparse, json, subprocess, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QA   = ROOT / "qa_27B"
AUDIO = ROOT / "audio"
ASR_MODEL = "mobiuslabsgmbh/faster-whisper-large-v3-turbo"
PILOT = ["01", "69A", "110B"]
N_SAMPLE = 25          # sentences sampled per session (evenly spaced)
G_OWN, A_OWN = 0.90, 0.70   # anchor_rate GO / ADJUST thresholds


def levenshtein(a: str, b: str) -> int:
    if a == b: return 0
    if not a: return len(b)
    if not b: return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            cur[j] = min(cur[j-1]+1, prev[j]+1, prev[j-1] + (ca != cb))
        prev = cur
    return prev[-1]


def _clean(s: str) -> str:
    # strip whitespace + punctuation so CER is character content only
    import unicodedata
    return "".join(c for c in s
                   if not c.isspace()
                   and unicodedata.category(c)[0] not in ("P", "S"))


def seg_cer(ref: str, hyp: str) -> float:
    r, h = _clean(ref), _clean(hyp)
    if not r:
        return 0.0 if not h else 1.0
    return levenshtein(r, h) / len(r)


def extract_segment(sid: str, start: float, end: float, out_wav: Path) -> bool:
    src = AUDIO / f"{sid}.mp3"
    if not src.exists():
        return False
    dur = max(0.25, end - start)
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-ss", f"{start:.3f}", "-i", str(src), "-t", f"{dur:.3f}",
           "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(out_wav)]
    try:
        subprocess.run(cmd, check=True, timeout=60)
        return out_wav.exists() and out_wav.stat().st_size > 0
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sessions", nargs="*", default=PILOT)
    ap.add_argument("--n-sample", type=int, default=N_SAMPLE)
    args = ap.parse_args()

    from faster_whisper import WhisperModel
    t0 = time.time()
    model = WhisperModel(ASR_MODEL, device="cpu", compute_type="int8")
    print(f"faster-whisper loaded {time.time()-t0:.1f}s", flush=True)

    def asr(wav: Path) -> str:
        segs, _ = model.transcribe(str(wav), language="zh",
                                   vad_filter=False, beam_size=5)
        return "".join(s.text for s in segs)

    tmp = ROOT / "qa_27B" / "_anchor_tmp"
    tmp.mkdir(exist_ok=True)

    summary = {"asr_model": ASR_MODEL, "n_sample_default": args.n_sample,
               "is_audio_grounded": True, "is_human_ear_review": False,
               "is_go_gate": False,
               "note": ("Audio-grounded sentence-ANCHOR audit. Real audio "
                        "segments [start,end] are extracted and transcribed by "
                        "an independent ASR; each segment is compared to its "
                        "own sentence vs its neighbours. This verifies the "
                        "timestamps are audio-grounded. It is NOT a human-ear "
                        "review and NOT a text-accuracy GO gate on its own."),
               "sessions": []}

    for sid in args.sessions:
        print(f"\n=== anchor audit {sid} ===", flush=True)
        pil = json.loads((QA / f"stage2v2_aligned_{sid}.json").read_text())
        # flatten sentences with their audio-grounded timestamps + text
        sents = []
        for para in pil["paragraphs"]:
            for s in para["sentences"]:
                sents.append({"start": s["start"], "end": s["end"],
                              "text": s["text"], "needs_review": s.get("needs_review", False)})
        n = len(sents)
        k = min(args.n_sample, n)
        # evenly spaced indices
        idxs = sorted({round(i * (n - 1) / max(1, k - 1)) for i in range(k)}) if k > 1 else [0]

        rows = []
        # Coarse monotonicity check (skip sentence pairs with any missing ts)
        pairs_with_ts = [(sents[i], sents[i+1])
                         for i in range(len(sents) - 1)
                         if sents[i].get("start") is not None and sents[i].get("end") is not None
                         and sents[i+1].get("start") is not None and sents[i+1].get("end") is not None]
        mono_ok = all(a["end"] <= b["start"] + 0.05 or a["start"] <= b["start"]
                      for a, b in pairs_with_ts)
        t0 = time.time()
        for rank, i in enumerate(idxs):
            s = sents[i]
            wav = tmp / f"{sid}_{i:03d}.wav"
            ok = extract_segment(sid, s["start"], s["end"], wav)
            if not ok:
                rows.append({"i": i, "start": s["start"], "end": s["end"],
                             "extract_failed": True, "anchor_ok": False})
                continue
            hyp = asr(wav)
            own = seg_cer(sents[i]["text"], hyp)
            prev = seg_cer(sents[i-1]["text"], hyp) if i > 0 else 9.9
            nxt = seg_cer(sents[i+1]["text"], hyp) if i < n-1 else 9.9
            anchor_ok = (own <= prev) and (own <= nxt)
            rows.append({"i": i, "start": s["start"], "end": s["end"],
                         "dur": round(s["end"]-s["start"], 3),
                         "published": s["text"],
                         "asr": hyp.strip(),
                         "own_cer": round(own, 4), "prev_cer": round(prev, 4),
                         "next_cer": round(nxt, 4),
                         "anchor_ok": anchor_ok,
                         "needs_review": s.get("needs_review", False)})
            if (rank + 1) % 5 == 0:
                print(f"  {rank+1}/{len(idxs)} audited, "
                      f"anchor_rate so far "
                      f"{sum(1 for r in rows if r['anchor_ok'])/len(rows):.2f}",
                      flush=True)
        n_ok = sum(1 for r in rows if r.get("anchor_ok"))
        n_eff = len(rows)
        rate = n_ok / n_eff if n_eff else 0.0
        verdict = "GO" if (rate >= G_OWN and mono_ok) else (
                  "ADJUST" if rate >= A_OWN else "STOP")
        summary["sessions"].append({
            "sessionId": sid,
            "n_sentences": n, "n_audited": n_eff,
            "n_anchor_ok": n_ok, "anchor_rate": round(rate, 4),
            "timestamps_monotonic": mono_ok,
            "verdict": verdict,
            "audit_duration_s": round(time.time()-t0, 1),
            "rows": rows,
        })
        print(f"  {sid}: {n_ok}/{n_eff} anchor_ok, rate={rate:.3f}, "
              f"mono={mono_ok} -> {verdict}", flush=True)

    # cleanup temp wavs
    for f in tmp.glob("*.wav"):
        try: f.unlink()
        except Exception: pass
    (QA / "audio_anchor_audit.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n=== DONE ===")
    for s in summary["sessions"]:
        print(f"  {s['sessionId']}: {s['n_anchor_ok']}/{s['n_audited']} "
              f"rate={s['anchor_rate']} mono={s['timestamps_monotonic']} "
              f"{s['verdict']}")


if __name__ == "__main__":
    main()
