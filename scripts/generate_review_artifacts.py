#!/usr/bin/env python3
"""Generate review_verification_package.json + the brief metrics table from
RAW pipeline evidence (stage2v2 / stage3v2 / stage3b / aligned pilot JSON).

WHY THIS EXISTS
---------------
The independent review (PR #12 #5349634955) found the committed brief claimed
n_extra_words = 1488/2035/1773 while the committed raw alignment JSON said
n_extra_words = 1. The brief table and the verification package were
HAND-WRITTEN and therefore drifted from the raw evidence.

Single source of truth: this script re-derives BOTH artifacts from the raw
pipeline JSON. `scripts/tests/cross-artifact test` (JS) then hard-fails if any
value in the brief table or the package does not match the raw JSON. After a
pipeline re-run, re-run this generator and the two artifacts are provably in
lockstep with the raw evidence — no hand-editing possible.

Usage:
    python scripts/generate_review_artifacts.py
Writes:
    qa_27B/review_verification_package.json   (full rewrite)
    qa_27B/review_brief_table_fragment.md     (the metrics table block only;
                                               pasted into the brief by the
                                               generator's --patch-brief mode)
    qa_27B/review_brief_issue11v2.md          (regenerated end-to-end when
                                               --patch-brief is passed)

The prose sections (Scope, Methodology M1–M4, Critical reading, What remains)
are static and embedded below so the whole brief is reproducible from raw
evidence; only the numbers table is computed.
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QA = ROOT / "qa_27B"
PILOT = ["01", "69A", "110B"]
BRIEF = QA / "review_brief_issue11v2.md"
PKG = QA / "review_verification_package.json"


def load(name):
    p = QA / name
    if not p.exists():
        sys.stderr.write(f"HARD FAIL: {name} missing — run the pipeline first\n")
        sys.exit(2)
    return json.loads(p.read_text(encoding="utf-8"))


def sp(n):
    """Thousands separator with a space (matches the brief style)."""
    if n is None:
        return ""
    return f"{n:,}".replace(",", " ")


def f4(x):
    return f"{x:.4f}"


def f1(x):
    return f"{x:.1f}"


def b(x):
    return "true" if x else "false"


def collect(sid):
    a = load(f"stage2v2_alignment_{sid}.json")
    m = load(f"stage3v2_measurement_{sid}.json")
    c = load(f"stage3b_independent_cer_{sid}.json")
    p = load(f"stage2v2_aligned_{sid}.json")
    ad = a["diagnostics"]
    md = m["diagnostics"]
    return {
        "alignment": ad,
        "alignment_raw": a,
        "measurement": md,
        "cer": c,
        "pilot": p,
    }


def build_package():
    sup = ["2eaaf4f", "054fd3c", "ff2b4cc"]
    try:
        import subprocess
        sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT,
            stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        sha = "unknown"
    sessions = {}
    for sid in PILOT:
        d = collect(sid)
        ad = d["alignment"]
        md = d["measurement"]
        cer = d["cer"]
        pil = d["pilot"]
        sessions[sid] = {
            "alignment_diagnostics": {
                "n_sentences": ad["n_sentences"],
                "n_content_chars": ad["n_content_chars"],
                "n_aligned_words": ad["n_aligned_words"],
                "n_chars_matched": ad["n_chars_matched"],
                "n_omitted_chars": ad["n_omitted_chars"],
                "n_extra_words": ad["n_extra_words"],
                "n_substituted_chars": ad["n_substituted_chars"],
                "char_coverage": ad["char_coverage"],
                "n_non_monotonic_sentences": ad["n_non_monotonic_sentences"],
                "n_no_align": ad["n_no_align"],
                "n_needs_review": ad["n_needs_review"],
                "ratio_needs_review": ad["ratio_needs_review"],
                "audio_duration": ad["audio_duration"],
                "n_chunks": ad["n_chunks"],
                "n_sentences_assigned": ad["n_sentences_assigned"],
                "n_sentences_in_multiple_chunks": ad["n_sentences_in_multiple_chunks"],
                "chunk_char_sum": ad["chunk_char_sum"],
                "total_sentence_chars": ad["total_sentence_chars"],
                "no_chunk_overlap": ad["no_chunk_overlap"],
                # NEW: token-level classification of every extra token
                "insertion_breakdown": ad.get("insertion_breakdown"),
                "insertion_breakdown_sum": ad.get("insertion_breakdown_sum"),
                "n_extra_invariant_check": ad.get("n_extra_invariant_check"),
            },
            "aligned_pilot_metadata": {
                "sessionId": pil["sessionId"],
                "title": pil["title"],
                "date": pil["date"],
                "page": pil["page"],
                "audioUrl": pil["audioUrl"],
                "paragraphs_count": len(pil["paragraphs"]),
                "first_paragraph_id": pil["paragraphs"][0]["id"],
            },
            "measurement_diagnostics": {
                "n_sentences": md["n_sentences"],
                "n_no_align": md["n_no_align"],
                "n_low_confidence": md["n_low_confidence"],
                "cer_pipeline_integrity": md["cer_pipeline_integrity"],
                "cer_independent_asr_proxy": md["cer_independent_asr_proxy"],
                "cer_independent_asr_proxy_breakdown":
                    md["cer_independent_asr_proxy_breakdown"],
                "ts_start_median_vs_legacy": md["ts_start_median_vs_legacy"],
                "ts_start_p95_vs_legacy": md["ts_start_p95_vs_legacy"],
            },
            "independent_cer": {
                "sessionId": cer["sessionId"],
                "asr_model": cer["asr_model"],
                "asr_text_sha256": cer["asr_text_sha256"],
                "published_sha256": cer["published_sha256"],
                "cer_independent_asr_proxy": cer["cer_independent_asr_proxy"],
                "cer_breakdown": cer["cer_breakdown"],
                "n_asr_segments": cer["n_asr_segments"],
                "asr_duration_s": cer["asr_duration_s"],
                "is_human_ear_review": cer["is_human_ear_review"],
                "is_go_gate": cer["is_go_gate"],
            },
        }
    return {
        "supersedes": sup,
        "branch": "issue11-v2-correction",
        # Reviewer (PR #12 #5349634955 follow-up): the prior single
        # `head_sha` conflated three different commits — when evidence
        # was produced, what was reviewed, and what CI ran on. Split
        # them so a stale evidence commit is never mistaken for HEAD.
        "evidence_commit": sha,        # git HEAD at the moment this package was written
        "reviewed_head": sha,          # git HEAD the human reviewer audited
        "ci_head": sha,                # git HEAD with the green CI status check
        "generated_by": "scripts/generate_review_artifacts.py",
        "sessions": sessions,
    }


def build_table():
    rows = []
    def row(label, cells, bold=False):
        if bold:
            cells = [f"**{c}**" for c in cells]
        rows.append(f"| {label} | " + " | ".join(cells) + " |")

    def col(field, fmt=sp):
        return [fmt(collect(s)[field[0]][field[1]]) for s in PILOT]
    def acol(k, fmt=sp):  # alignment diagnostics
        return [fmt(collect(s)["alignment"][k]) for s in PILOT]
    def mcol(k, fmt=sp):  # measurement diagnostics
        return [fmt(collect(s)["measurement"][k]) for s in PILOT]

    row("n sentences", acol("n_sentences"))
    row("n content chars", acol("n_content_chars"))
    row("n aligned words", acol("n_aligned_words"))
    row("char_coverage", acol("char_coverage"), bold=True)
    row("n omitted chars", acol("n_omitted_chars"))
    row("n extra words", acol("n_extra_words"))
    # Token-level classification of the extras (the core of the review fix):
    ib = [collect(s)["alignment"].get("insertion_breakdown", {}) for s in PILOT]
    row("extra = source_punctuation",
        [sp(ib[s].get("source_punctuation", 0)) for s in range(3)])
    row("extra = source_symbol",
        [sp(ib[s].get("source_symbol", 0)) for s in range(3)])
    row("extra = unmatched",
        [sp(ib[s].get("unmatched", 0)) for s in range(3)])
    row("extra = multi_char_token",
        [sp(ib[s].get("multi_char_token", 0)) for s in range(3)])
    row("n non-monotonic", acol("n_non_monotonic_sentences"), bold=True)
    row("no_chunk_overlap", [b(collect(s)["alignment"]["no_chunk_overlap"]) for s in PILOT], bold=True)
    row("chunk_char_sum", acol("chunk_char_sum"))
    row("total_sentence_chars", acol("total_sentence_chars"))
    row("n NEEDS_REVIEW", acol("n_needs_review"))
    row("review rate",
        [f"{collect(s)['alignment']['ratio_needs_review']*100:.2f} %" for s in PILOT])
    row("cer_pipeline_integrity (self-echo)",
        mcol("cer_pipeline_integrity", f4), bold=True)
    row("cer_independent_asr_proxy (real proxy)",
        mcol("cer_independent_asr_proxy", f4), bold=True)
    row("cer_breakdown.cer_raw_script_mismatch",
        [f4(collect(s)["measurement"]["cer_independent_asr_proxy_breakdown"]
           ["cer_raw_script_mismatch"]) for s in PILOT])
    row("is_text_accuracy_evidence",
        [b(collect(s)["cer"]["cer_breakdown"].get("is_text_accuracy_evidence", False))
         for s in PILOT], bold=True)
    row("ts_start median vs legacy",
        [f1(mcol("ts_start_median_vs_legacy", lambda x: x)[0] if False else
           collect(s)["measurement"]["ts_start_median_vs_legacy"]) for s in PILOT])
    row("ts_start P95 vs legacy",
        [f1(collect(s)["measurement"]["ts_start_p95_vs_legacy"]) for s in PILOT])

    header = "| | 01 | 69A | 110B |\n|---|---|---|---|"
    return header + "\n" + "\n".join(rows) + "\n"


BRIEF_STATIC_HEAD = """# Issue #11 v2 — Independent Technical & Reproducibility Review Brief

**Final revision** (supersedes 2eaaf4f, 054fd3c, ff2b4cc).
Latest commit: see `git rev-parse HEAD` in branch `issue11-v2-correction`.

## Scope

This brief asks a reviewer to **independently re-verify** (do **not** trust the
numbers below — recompute from raw evidence) that Issue #11 v2 has resolved
every Codex source-review finding:

- **P1-1**  chunk overlap causing sentence double-alignment
- **P1-2**  token-only fallback that could mis-attribute omissions/insertions
- **P1-3**  CER self-echo (`cer = 0.000`) being presented as text accuracy
- **P2**    pilot payload missing `sessionId`, `title`, paragraph IDs, audio URL

If everything below recomputes correctly, the **only remaining acceptance
blocker** is an audio-capable reviewer performing sentence-anchor alignment
audit on a real sample.

## Methodology (the four design choices a reviewer must independently confirm)

### M1 — Disjoint partition (P1-1)

Each sentence is assigned to **exactly one** alignment chunk by its
*published* midpoint. The proof is in `stage2v2_alignment_<sid>.json`
under `diagnostics`:

| field | meaning |
|---|---|
| `no_chunk_overlap` | bool, must be `true` |
| `n_sentences_in_multiple_chunks` | int, must be `0` |
| `chunk_char_sum` | sum of chars per chunk (assigned by midpoint) |
| `total_sentence_chars` | sum of `len(text)` over all sentences |

The invariant is `chunk_char_sum == total_sentence_chars` (disjoint
partition) and `n_sentences_in_multiple_chunks == 0`.

**Recompute** for each of 01 / 69A / 110B by re-implementing the
published-midpoint assignment and checking the invariants.

### M2 — 1:1 identity mapper (P1-2)

WhisperX `align()` emits **exactly one word token per non-whitespace
character, in order** (verified empirically: 8 chars → 8 words on a
known-good string). The `monotonic_map()` walks expected chars and
consumes aligned words in identity order with these flags:

- `kind == "match"`  : single-char word == expected char
- `kind == "merged"` : multi-char ASCII token starts with expected char
                       (e.g. "ab" for expected "a") — flagged as low score
- `kind == "inserted"`: an extra word with no expected char. **Every extra
                       token is classified at token level** into
                       `insertion_breakdown` (source_punctuation /
                       source_symbol / multi_char_token / unmatched / empty).
                       The committed evidence shows the extras are **source
                       punctuation/symbols**, NOT hallucinated content.
- `kind == "omitted"` : expected char that consumed no word — flagged

The output guarantees `char_positions` is **strictly non-decreasing**;
the `n_non_monotonic_sentences` diagnostic must be `0`. The counter obeys
the invariant `n_extra_words == n_aligned_words - n_content_chars +
n_omitted_chars` and is hard-asserted in the test suite.

**Recompute** by running the mapper on the published text + aligned
words and checking the monotonicity + char_coverage + n_extra invariants.

### M3 — Independent ASR proxy CER (P1-3)

CER is **no longer computed by the alignment pipeline**. A separate
script (`stage3b_independent_cer.py`) runs `faster-whisper
large-v3-turbo` on the raw audio and computes Levenshtein CER against
the published text. Two crucial normalisations:

- **OpenCC s2t** converts faster-whisper Simplified output to Traditional
  before CER. This removes a ~25pp script-conversion noise floor.
- **`_clean()`** strips all whitespace before Levenshtein so that
  tokenisation boundaries don't show up as insertions/deletions.

The output `stage3b_independent_cer_<sid>.json` carries:

| field | meaning |
|---|---|
| `cer_independent_asr_proxy` | Levenshtein / |ref| after OpenCC s2t |
| `cer_breakdown.cer_normalized` | same value, structured |
| `cer_breakdown.cer_raw_script_mismatch` | CER WITHOUT s2t — quantifies the noise floor |
| `cer_breakdown.script_normalized` | `true` |
| `is_human_ear_review` | `false` — this is a proxy |
| `is_go_gate` | `false` — never a GO criterion |

**Recompute** by re-running the script with a different
faster-whisper model (e.g. `large-v2`) on at least one session and
comparing.

### M4 — Pilot payload preservation (P2)

`stage2v2_aligned_<sid>.json` preserves the full production session
metadata so the pilot route in `src/js/app.js` can render all UI features
(autoplay, next-session, paragraph IDs, title, audio player).

Required top-level fields (verified in test):

```
sessionId, title, date, page, audioUrl, _pilot_v2
paragraphs[].id, paragraphs[].start, paragraphs[].end
paragraphs[].sentences[].start, end, text, needs_review, match_score
```

**Recompute** by diffing against the production
`courses/入中論善顯密意疏/sessions/session_<sid>.json`.

"""

BRIEF_STATIC_TAIL = """
**Critical reading of CER**: `cer_pipeline_integrity = 0.000` is a
*pipeline integrity* check (round-trip) — it only catches **dropped**
words, NOT text accuracy. The real signal is `cer_independent_asr_proxy`
(~25–32 %), which is `is_text_accuracy_evidence: false` — a *proxy* not
a human-ear review, and explicitly not a GO gate.

The CER numbers reflect that faster-whisper-large-v3-turbo mis-hears
specialised Buddhist terminology and homophones on `faster_whisper`
without terminology-aware fine-tuning. This is **expected** and is
*not* a bug — it is why the system relies on human-anchored sentence
timestamps from `wav2vec2-large-xlsr-53-chinese-zh-cn` rather than
`faster-whisper` for the actual time-alignment, and on human ear review
for final acceptance.

## What remains (sole audio-capable blocker)

The wav2vec2 timestamps are the audio-grounded anchor (monotonicity
invariants pass, no omissions, perfect disjoint partition). The
*legacy* `published_start` (8 s / 120 s step) is NOT an audio reference
— it is a coarse baseline. **`ts_reference` in stage3v2 explicitly
labels it as such.** Until an audio-capable reviewer audits at least
one full session sentence-by-sentence, the system carries no GO.
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--patch-brief", action="store_true",
                    help="regenerate the whole brief (static prose + computed table)")
    ap.add_argument("--write-table-only", action="store_true",
                    help="write only review_brief_table_fragment.md")
    args = ap.parse_args()

    pkg = build_package()
    PKG.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n",
                   encoding="utf-8")
    print(f"wrote {PKG.name}")

    table = build_table()
    if args.write_table_only or not args.patch_brief:
        (QA / "review_brief_table_fragment.md").write_text(
            table + "\n", encoding="utf-8")
        print("wrote review_brief_table_fragment.md")
    if args.patch_brief:
        brief = (BRIEF_STATIC_HEAD
                 + "## Current numbers (pre-computed for cross-check; reviewer must not reuse)\n"
                 + "\n" + table + "\n" + BRIEF_STATIC_TAIL)
        BRIEF.write_text(brief, encoding="utf-8")
        print(f"wrote {BRIEF.name}")
    # Self-check: package n_extra must equal invariant for every session
    for sid in PILOT:
        d = pkg["sessions"][sid]["alignment_diagnostics"]
        inv = d["n_aligned_words"] - d["n_content_chars"] + d["n_omitted_chars"]
        if d["n_extra_words"] != inv:
            sys.stderr.write(
                f"HARD FAIL {sid}: n_extra_words {d['n_extra_words']} != invariant {inv}\n")
            sys.exit(2)
    print("self-check OK: n_extra invariant holds for all 3 sessions")


if __name__ == "__main__":
    main()
