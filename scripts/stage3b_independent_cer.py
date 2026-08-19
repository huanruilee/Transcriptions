#!/usr/bin/env python3
"""
Stage 3b — Independent ASR proxy CER (Issue #11 v2, P1-3 fix).

The forced-alignment CER in stage 2 is a *pipeline integrity* check
(published text round-tripped through align → always 0 by construction).
It is NOT a text-accuracy signal. This stage runs an INDEPENDENT
faster-whisper model (no forced text) on the audio and computes:

    cer_independent_asr_proxy =
        Levenshtein(published_text, faster_whisper_transcript) / len(published_text)

This is a real (if proxy) measurement of how well the published text
matches what is actually spoken. Per the review contract it is:
  - NOT a human ear review
  - NOT a GO/NO-GO gate
  - a technical/reproducibility signal only

Outputs:
  qa_27B/stage3b_independent_cer_<sid>.json
  qa_27B/stage3b_independent_cer_manifest.json
"""
from __future__ import annotations
import argparse, hashlib, json, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QA   = ROOT / "qa_27B"
AUDIO = ROOT / "audio"
SESSIONS_DIR = ROOT / "courses" / "入中論善顯密意疏" / "sessions"
PILOT = ["01", "69A", "110B"]
ASR_MODEL = "mobiuslabsgmbh/faster-whisper-large-v3-turbo"


def sha256(p: Path) -> str:
    h = hashlib.sha256(); h.update(p.read_bytes()); return h.hexdigest()


def levenshtein(a: str, b: str) -> int:
    if a == b: return 0
    if not a: return len(b)
    if not b: return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            cur[j] = min(cur[j-1]+1, prev[j]+1, prev[j-1]+(ca != cb))
        prev = cur
    return prev[-1]


def _clean(s: str) -> str:
    return "".join(c for c in s if not c.isspace())


# Published text is Traditional Chinese (校黃金法則), but faster-whisper
# emits Simplified. Without OpenCC s2t normalization, ~25 pp of CER is just
# script-conversion noise, not real ASR error.
_OPENCC_S2T = None
def _s2t(s: str) -> str:
    global _OPENCC_S2T
    if _OPENCC_S2T is None:
        import opencc
        _OPENCC_S2T = opencc.OpenCC("s2t")
    return _OPENCC_S2T.convert(s)


def cer(ref: str, hyp: str) -> tuple[float, dict]:
    """Returns (cer_score, breakdown). CER is computed on Traditional-Chinese
    vs Traditional-Chinese (both sides converted from any Simplified that
    faster-whisper emits). `breakdown` records which comparator was used so
    the result is interpretable."""
    r_t, h_t = _clean(_s2t(ref)), _clean(_s2t(hyp))
    r_raw, h_raw = _clean(ref), _clean(hyp)
    if not r_t:
        score = 0.0 if not h_t else 1.0
        return score, {"cer_normalized": score, "cer_raw": score,
                       "script_normalized": True}
    cer_t = levenshtein(r_t, h_t) / len(r_t)
    cer_raw = levenshtein(r_raw, h_raw) / len(r_raw)
    return cer_t, {"cer_normalized": round(cer_t, 6),
                   "cer_raw_script_mismatch": round(cer_raw, 6),
                   "ref_traditional_len": len(r_t),
                   "script_normalized": True}


def transcribe(sid: str, model_id: str) -> tuple[str, list]:
    from faster_whisper import WhisperModel
    t0 = time.time()
    model = WhisperModel(model_id, device="cpu", compute_type="int8")
    print(f"  faster-whisper loaded {time.time()-t0:.1f}s", flush=True)
    t0 = time.time()
    segments, info = model.transcribe(
        str(AUDIO / f"{sid}.mp3"), language="zh",
        vad_filter=True, beam_size=5)
    texts, segs = [], []
    for seg in segments:
        texts.append(seg.text)
        segs.append({"start": round(seg.start, 3), "end": round(seg.end, 3),
                     "text": seg.text.strip()})
    print(f"  transcribed in {time.time()-t0:.1f}s, {len(segs)} segments", flush=True)
    return " ".join(texts), segs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sessions", nargs="*", default=PILOT)
    ap.add_argument("--model", default=ASR_MODEL)
    args = ap.parse_args()
    model_id = args.model

    summary = {"stages": [], "asr_model": model_id,
               "note": ("Independent ASR proxy. NOT a human ear review, NOT a "
                        "GO/NO-GO gate. Technical/reproducibility signal only.")}
    for sid in args.sessions:
        print(f"\n=== independent ASR {sid} ===", flush=True)
        sess_path = SESSIONS_DIR / f"session_{sid}.json"
        sess = json.loads(sess_path.read_text())
        published = " ".join(s["text"] for p in sess["paragraphs"]
                             for s in p["sentences"])
        t0 = time.time()
        asr_text, asr_segs = transcribe(sid, model_id)
        c, breakdown = cer(published, asr_text)
        payload = {
            "sessionId": sid,
            "asr_model": model_id,
            "asr_text_sha256": hashlib.sha256(asr_text.encode()).hexdigest(),
            "published_sha256": sess_path and sha256(sess_path),
            "cer_independent_asr_proxy": round(c, 6),
            "cer_breakdown": breakdown,
            "n_asr_segments": len(asr_segs),
            "asr_duration_s": round(time.time()-t0, 2),
            "is_human_ear_review": False,
            "is_go_gate": False,
            "limitation": ("Proxy CER from an independent neural ASR. It does "
                           "not confirm Buddhist-term correctness or human "
                           "perceived text accuracy. Sent as technical signal "
                           "only; final text-accuracy acceptance requires an "
                           "audio-capable reviewer."),
            "asr_segments": asr_segs,
        }
        p = QA / f"stage3b_independent_cer_{sid}.json"
        p.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
        print(f"  CER proxy={c:.4f} (script-normalized) raw={breakdown['cer_raw_script_mismatch']:.4f} -> {p}", flush=True)
        summary["stages"].append({
            "sessionId": sid,
            "cer_independent_asr_proxy": round(c, 6),
            "cer_raw_script_mismatch": breakdown["cer_raw_script_mismatch"],
            "script_normalized": True,
            "asr_model": ASR_MODEL,
            "is_go_gate": False,
            "evidence_path": f"qa_27B/stage3b_independent_cer_{sid}.json",
        })
    (QA / "stage3b_independent_cer_manifest.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2))
    print("\n=== DONE ===")
    print(json.dumps(summary["stages"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
