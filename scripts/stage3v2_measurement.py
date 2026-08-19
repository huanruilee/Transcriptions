#!/usr/bin/env python3
"""
Stage 3v2 — Issue #11 v2 measurement methodology (P1-3 + hard-fail fix).

Replaces commit 2eaaf4f Stage 3 and interim 054fd3c. This revision:

  1. Hard-fails (exit non-zero) when alignment evidence or the independent
     ASR proxy is missing, instead of silently skipping. The old code
     returned None and `continue`d, which masked missing evidence.
  2. Separates CER into two explicitly-labelled quantities:
       - cer_pipeline_integrity: Levenshtein(published, align-derived text).
         This is ~0 BY CONSTRUCTION (we force-align the published text and
         read it back). It is NOT a text-accuracy signal and must not be
         reported as one. It only detects dropped words in the mapping.
       - cer_independent_asr_proxy: from stage3b (separate neural ASR on
         audio). This is the ONLY text-accuracy-ish number, and it is a
         PROXY — not a human-ear review, not a GO/NO-GO gate.
  3. ts error is measured against published_start but explicitly labelled
     as a LEGACY/COARSE baseline, NOT an audio-grounded acceptance
     reference. The alignment's own timestamps are the audio-grounded
     anchor; a true sentence-anchor acceptance needs an audio-capable
     reviewer, which is the sole remaining blocker.
"""
from __future__ import annotations
import argparse, hashlib, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QA   = ROOT / "qa_27B"
SESSIONS_DIR = ROOT / "courses" / "入中論善顯密意疏" / "sessions"
PILOT = ["01", "69A", "110B"]

BUDDHIST_TERMS = [
    "般若波羅蜜多", "般若", "波羅蜜", "波羅蜜多",
    "中觀", "中論", "現前地", "聖者", "菩薩",
    "菩提", "涅槃", "空性", "世俗諦", "勝義諦",
    "歸敬頌", "禮讚文",
]


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


def cer(ref: str, hyp: str) -> float:
    r, h = _clean(ref), _clean(hyp)
    if not r:
        return 0.0 if not h else 1.0
    return levenshtein(r, h) / len(r)


def percentile(values: list, p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = int(round(p / 100 * (len(s) - 1)))
    return s[idx]


def _require(path: Path, label: str):
    if not path.exists():
        sys.stderr.write(
            f"\nHARD FAIL: missing {label} ({path}). "
            f"Run the upstream stage before stage3v2_measurement.\n")
        sys.exit(2)
    return path


def measure_session(sid: str, require_asr: bool = True) -> dict:
    align_path = _require(QA / f"stage2v2_alignment_{sid}.json",
                          f"alignment evidence for {sid}")
    sess_path  = _require(SESSIONS_DIR / f"session_{sid}.json",
                          f"published session JSON for {sid}")
    align = json.loads(align_path.read_text())
    sess  = json.loads(sess_path.read_text())

    pub_sents = []
    for p in sess["paragraphs"]:
        for s in p["sentences"]:
            pub_sents.append((s["text"], s.get("start", 0.0),
                              s.get("end", s.get("start", 0.0))))

    sents = align["sentences"]
    if len(sents) != len(pub_sents):
        sys.stderr.write(
            f"\nHARD FAIL: sentence count mismatch for {sid}: "
            f"aligned={len(sents)} published={len(pub_sents)}\n")
        sys.exit(3)

    start_deltas = []
    end_deltas = []
    term_misses = []
    no_align_count = 0
    low_conf_count = 0
    per_sent = []

    for idx, (a, (ptxt, ps, pe)) in enumerate(zip(sents, pub_sents)):
        # Pipeline-integrity CER: published vs align-derived text.
        # ~0 by construction; only detects dropped words in mapping.
        integrity_cer = cer(ptxt, a["text"])
        sentence_term_misses = [t for t in BUDDHIST_TERMS
                                if t in ptxt and t not in a["text"]]
        if a["start"] is not None and a["end"] is not None:
            start_deltas.append(abs(a["start"] - ps))
            end_deltas.append(abs(a["end"] - pe))
        else:
            no_align_count += 1
        if a.get("avg_score") is not None and a["avg_score"] < 0.5:
            low_conf_count += 1
        term_misses.extend(sentence_term_misses)
        per_sent.append({
            "index": idx,
            "cer_pipeline_integrity": round(integrity_cer, 4),
            "ts_start_err_vs_legacy": round(abs(a["start"] - ps), 3)
                                      if a["start"] is not None else None,
            "ts_end_err_vs_legacy": round(abs(a["end"] - pe), 3)
                                    if a["end"] is not None else None,
            "avg_score": a.get("avg_score"),
            "needs_review": bool(a["needs_review"]),
            "reason": a.get("reason"),
            "term_missed": sentence_term_misses,
        })

    # Pull the independent ASR proxy CER if present (P1-3: real signal).
    asr_path = QA / f"stage3b_independent_cer_{sid}.json"
    asr_cer = None
    asr_breakdown = None
    if asr_path.exists():
        asr_data = json.loads(asr_path.read_text())
        asr_cer = asr_data.get("cer_independent_asr_proxy")
        asr_breakdown = asr_data.get("cer_breakdown")
    elif require_asr:
        sys.stderr.write(
            f"\nHARD FAIL: missing independent ASR proxy for {sid} ({asr_path}). "
            f"Run stage3b_independent_cer.py first.\n")
        sys.exit(4)

    d = align.get("diagnostics", {})
    diag = {
        "n_sentences": len(sents),
        "n_no_align": no_align_count,
        "n_low_confidence": low_conf_count,
        # CER semantics:
        "cer_pipeline_integrity": round(
            sum(cer(ptxt, a["text"]) for a, (ptxt, _, _) in zip(sents, pub_sents))
            / max(1, len(sents)), 6),
        "cer_pipeline_integrity_note": (
            "~0 by construction (published text forced-aligned and read back). "
            "NOT a text-accuracy signal. Detects dropped words only."),
        "cer_independent_asr_proxy": asr_cer,
        "cer_independent_asr_proxy_breakdown": asr_breakdown,
        "cer_independent_asr_proxy_note": (
            "Levenshtein(published, independent faster-whisper transcript)/|published|. "
            "A PROXY, not a human-ear review, not a GO/NO-GO gate."),
        "is_text_accuracy_evidence": False,
        # ts error: labelled legacy/coarse baseline.
        "ts_start_median_vs_legacy": round(percentile(start_deltas, 50), 3),
        "ts_start_p95_vs_legacy": round(percentile(start_deltas, 95), 3),
        "ts_end_median_vs_legacy": round(percentile(end_deltas, 50), 3),
        "ts_end_p95_vs_legacy": round(percentile(end_deltas, 95), 3),
        "ts_reference": (
            "published_start is a LEGACY/COARSE baseline (8s/120s step), "
            "NOT an audio-grounded acceptance reference. The alignment's own "
            "wav2vec2 timestamps are the audio-grounded anchor; final "
            "sentence-anchor acceptance requires an audio-capable reviewer."),
        # alignment coverage (from stage 2 identity mapping)
        "char_coverage": d.get("char_coverage"),
        "n_omitted_chars": d.get("n_omitted_chars"),
        "n_non_monotonic_sentences": d.get("n_non_monotonic_sentences", 0),
        "n_term_errors": len(term_misses),
        "term_missed_list": sorted(set(term_misses)),
    }

    payload = {
        "sessionId": sid,
        "alignment_evidence_path": f"qa_27B/stage2v2_alignment_{sid}.json",
        "independent_asr_path": (f"qa_27B/stage3b_independent_cer_{sid}.json"
                                 if asr_path.exists() else None),
        "session_json_sha256": hashlib.sha256(sess_path.read_bytes()).hexdigest(),
        "alignment_sha256": hashlib.sha256(align_path.read_bytes()).hexdigest(),
        "diagnostics": diag,
        "per_sentence": per_sent,
        "method": {
            "cer_pipeline_integrity": "Levenshtein(published, align-derived)/|published|",
            "cer_independent_asr_proxy": "stage3b (separate neural ASR, audio->text)",
            "ts_error": "|aligned.start - published.start|, matched by sentence index",
            "ts_reference_caveat": "published_start = legacy/coarse, NOT audio-grounded",
            "supersedes": "2eaaf4f / 054fd3c Stage 3 (self-echo CER presented as accuracy)",
        },
    }
    out_path = QA / f"stage3v2_measurement_{sid}.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"  -> {out_path}", flush=True)
    print(f"     integrity_CER={diag['cer_pipeline_integrity']} "
          f"independent_proxy_CER={asr_cer} "
          f"ts_med_vs_legacy={diag['ts_start_median_vs_legacy']}s "
          f"char_cov={diag['char_coverage']} "
          f"non_mono={diag['n_non_monotonic_sentences']} "
          f"term_err={diag['n_term_errors']}", flush=True)
    return payload


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sessions", nargs="*", default=PILOT)
    ap.add_argument("--no-require-asr", action="store_true",
                    help="do not hard-fail if independent ASR proxy is missing")
    args = ap.parse_args()
    summary = {"sessions": [],
               "supersedes": ["2eaaf4f", "054fd3c"],
               "supersedes_reason": (
                   "Stage 3 previously presented forced-alignment CER as "
                   "text accuracy (self-echo). Now split into "
                   "cer_pipeline_integrity (~0, not accuracy) and "
                   "cer_independent_asr_proxy (real, proxy only). ts error "
                   "labelled against a legacy/coarse baseline.")}
    for sid in args.sessions:
        print(f"\n=== session {sid} ===", flush=True)
        r = measure_session(sid, require_asr=not args.no_require_asr)
        summary["sessions"].append({"sessionId": sid,
                                    "diagnostics": r["diagnostics"]})
    (QA / "stage3v2_measurement_manifest.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2))
    print("\n=== DONE ===")
    print(json.dumps(summary["sessions"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
