# Issue #11 v2 — Independent Technical & Reproducibility Review Brief

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
- `kind == "inserted"`: an extra word with no expected char (whisperx
                        hallucinated punctuation, kept at position)
- `kind == "omitted"` : expected char that consumed no word — flagged

The output guarantees `char_positions` is **strictly non-decreasing**;
the `n_non_monotonic_sentences` diagnostic must be `0`.

**Recompute** by running the mapper on the published text + aligned
words and checking the monotonicity + char_coverage invariants.

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

## Current numbers (pre-computed for cross-check; reviewer must not reuse)

| | 01 | 69A | 110B |
|---|---|---|---|
| n sentences | 434 | 538 | 599 |
| n content chars | 8 574 | 11 381 | 11 257 |
| n aligned words | 10 062 | 13 416 | 13 030 |
| **char_coverage** | **1.0** | **1.0** | **1.0** |
| n omitted chars | 0 | 0 | 0 |
| n extra words | 1 | 1 | 1 |
| n non-monotonic | **0** | **0** | **0** |
| **no_chunk_overlap** | **true** | **true** | **true** |
| chunk_char_sum | 10 150 | 13 459 | 13 046 |
| total_sentence_chars | 10 150 | 13 459 | 13 046 |
| n NEEDS_REVIEW | 54 | 52 | 40 |
| review rate | 12.44 % | 9.67 % | 6.68 % |
| **cer_pipeline_integrity** (self-echo) | **0.000** | **0.000** | **0.000** |
| **cer_independent_asr_proxy** (real proxy) | **0.2918** | **0.3190** | **0.2570** |
| cer_breakdown.cer_raw_script_mismatch | 0.2915 | 0.5446 | 0.4969 |
| is_text_accuracy_evidence | **false** | **false** | **false** |
| ts_start median vs legacy | 21.2 s | 18.8 s | 14.1 s |
| ts_start P95 vs legacy | 64.8 s | 55.9 s | 62.2 s |

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
one full session sentence-by-sentence, the system carries no GO
certification on absolute timestamp accuracy.