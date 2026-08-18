#!/usr/bin/env python3
"""
Stage 3v2 — Issue #11 v2 measurement methodology.

Replaces commit 2eaaf4f Stage 3 which had:
  - SequenceMatcher.ratio() called CER (wrong)
  - ts error measured against nearest ASR word (not matched utterance)
  - No Levenshtein
  - No audio-grounded reference

v2 does:
  1. Standard CER = Levenshtein / |ref| on audio-grounded reference.
     The reference IS the published session JSON sentence text (which
     comes from human-corrected MacWhisper transcripts — the only
     audio-grounded reference available).
  2. ts absolute error = |aligned.start - published.start| per sentence
     (matched by sentence index, NOT nearest ASR word).
  3. Reports median + P95 of |delta| for both starts and ends.
  4. Buddhist-term error scan: known terms should appear in the published
     text. We check that aligned text preserves them (it doesn't change
     text — but we verify that the alignment didn't drop words).
  5. NEEDS_REVIEW count and ratio.
  6. Confidence = mean wav2vec2 word score per sentence.

Inputs:
  qa_27B/stage2v2_alignment_<sid>.json
Outputs:
  qa_27B/stage3v2_measurement_<sid>.json
  qa_27B/stage3v2_measurement_manifest.json
"""
from __future__ import annotations
import argparse, hashlib, json, statistics, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QA   = ROOT / "qa_27B"
SESSIONS_DIR = ROOT / "courses" / "入中論善顯密意疏" / "sessions"
PILOT = ["01", "69A", "110B"]

# Known critical Buddhist terms (audio-grounded check)
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
            cur[j] = min(
                cur[j-1] + 1,
                prev[j] + 1,
                prev[j-1] + (ca != cb)
            )
        prev = cur
    return prev[-1]


def cer(ref: str, hyp: str) -> float:
    ref_c = "".join(c for c in ref if not c.isspace())
    hyp_c = "".join(c for c in hyp if not c.isspace())
    if not ref_c:
        return 0.0 if not hyp_c else 1.0
    return levenshtein(ref_c, hyp_c) / len(ref_c)


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = int(round(p / 100 * (len(s) - 1)))
    return s[idx]


def measure_session(sid: str) -> dict:
    align_path = QA / f"stage2v2_alignment_{sid}.json"
    sess_path  = SESSIONS_DIR / f"session_{sid}.json"
    if not align_path.exists():
        return None
    align = json.loads(align_path.read_text())
    sess  = json.loads(sess_path.read_text())

    # Build published sentence list (audio-grounded reference text).
    pub_sents = []
    for p in sess["paragraphs"]:
        for s in p["sentences"]:
            pub_sents.append((s["text"], s.get("start", 0.0),
                              s.get("end", s.get("start", 0.0))))

    # Walk aligned sentences (same order as published).
    sents = align["sentences"]
    assert len(sents) == len(pub_sents), (
        f"len mismatch: aligned={len(sents)} pub={len(pub_sents)}")

    # Per-sentence metrics.
    start_deltas = []  # |aligned.start - published.start| when both exist
    end_deltas = []
    term_misses = []
    omitted_count = 0
    low_conf_count = 0
    per_sent = []

    for idx, (a, (ptxt, ps, pe)) in enumerate(zip(sents, pub_sents)):
        # CER: aligned text vs published text (same source — should be 0
        # unless whisperx dropped words). Both are derived from the same
        # published source, so this measures DROPPED WORDS not text edits.
        sentence_cer = cer(ptxt, a["text"])
        # Term check
        sentence_term_misses = [t for t in BUDDHIST_TERMS
                                if t in ptxt and t not in a["text"]]
        if a["start"] is not None and a["end"] is not None:
            start_deltas.append(abs(a["start"] - ps))
            end_deltas.append(abs(a["end"] - pe))
        else:
            omitted_count += 1
        if a.get("avg_score") is not None and a["avg_score"] < 0.5:
            low_conf_count += 1
        term_misses.extend(sentence_term_misses)
        per_sent.append({
            "index": idx,
            "cer": round(sentence_cer, 4),
            "abs_start_err": round(abs(a["start"] - ps), 3)
                             if a["start"] is not None else None,
            "abs_end_err":   round(abs(a["end"]   - pe), 3)
                             if a["end"]   is not None else None,
            "avg_score": a.get("avg_score"),
            "needs_review": bool(a["needs_review"]),
            "reason": a.get("reason"),
            "term_missed": sentence_term_misses,
        })

    diag = {
        "n_sentences":     len(sents),
        "n_aligned":       len(sents) - omitted_count,
        "n_omitted":       omitted_count,
        "n_low_confidence": low_conf_count,
        "cer_overall":     round(
            sum(cer(ptxt, a["text"]) for a, (ptxt, _, _)
                in zip(sents, pub_sents)) / max(1, len(sents)), 4),
        "cer_max":         round(max((cer(ptxt, a["text"])
                                for a, (ptxt, _, _)
                                in zip(sents, pub_sents)),
                                default=0), 4),
        "ts_start_median": round(percentile(start_deltas, 50), 3),
        "ts_start_p95":    round(percentile(start_deltas, 95), 3),
        "ts_end_median":   round(percentile(end_deltas, 50), 3),
        "ts_end_p95":      round(percentile(end_deltas, 95), 3),
        "ts_start_max":    round(max(start_deltas, default=0), 3),
        "ts_end_max":      round(max(end_deltas, default=0), 3),
        "n_term_errors":   len(term_misses),
        "term_missed_list": sorted(set(term_misses)),
    }

    payload = {
        "sessionId": sid,
        "alignment_evidence_path": f"qa_27B/stage2v2_alignment_{sid}.json",
        "session_json_sha256": hashlib.sha256(
            sess_path.read_bytes()).hexdigest(),
        "alignment_sha256": hashlib.sha256(
            align_path.read_bytes()).hexdigest(),
        "diagnostics": diag,
        "per_sentence": per_sent,
        "method": {
            "cer": "Levenshtein(ref) / |ref|",
            "ts_error": "matched-sentence index |aligned.start - published.start|",
            "matched_reference": "published session JSON sentence text "
                                 "(human-corrected MacWhisper)",
            "supersedes": "commit 2eaaf4f Stage 3 (SequenceMatcher.ratio, "
                          "nearest-ASR-word matching)",
        },
    }
    out_path = QA / f"stage3v2_measurement_{sid}.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"  -> {out_path} {diag}", flush=True)
    return payload


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sessions", nargs="*", default=PILOT)
    args = ap.parse_args()
    summary = {"sessions": [],
               "supersedes_commit": "2eaaf4f",
               "supersedes_reason": (
                   "Stage 3 used SequenceMatcher.ratio() as CER (wrong) and "
                   "measured ts error against nearest ASR word (not matched "
                   "utterance). v2 uses Levenshtein/|ref| and matched-sentence "
                   "index.")}
    for sid in args.sessions:
        print(f"\n=== session {sid} ===", flush=True)
        r = measure_session(sid)
        if r is None:
            print(f"  no alignment evidence for {sid}; skip")
            continue
        summary["sessions"].append({"sessionId": sid, "diagnostics": r["diagnostics"]})
    (QA / "stage3v2_measurement_manifest.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2))
    print("\n=== DONE ===")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()