# Study Group Session 01 — Editorial Evidence Adjudication (playlist-01)

Status: READY_FOR_INDEPENDENT_REVIEW

Scope: bounded editorial adjudication of five GPU audio anchors for video
7QA1k4uxxV0 (session 01). No audio was downloaded, no ASR was called, no
external sources were accessed, and no transcript/session content was
modified. Transcript evidence in this directory is recorded as SHA256 hashes
and structured evidence codes only; no published or ASR transcript wording is
quoted (an earlier revision of this ledger embedded short anchor-level
fragments in rationale prose — corrected per independent-review finding F1,
see fix_receipt.json).

## Provenance

- Baseline HEAD: 28748fbd9021ffb5b73a326606af749f13c79327 (task baseline)
- Frozen PR baseline commit: b69d71fde25f52f86fafb4bd0e89a77ab4fa33f7
- input_manifest.json sha256: f63497d0508ed4f4623d75bd7edeb0cbbf58da79f9fafb886f12b9f4f2014a9c
- Private GPU evidence: /home/henry/.gx10/tasks/study-group-session01-gpu-anchors-20260916/evidence
  (anchor_index.json holds all five roles; clip binaries deleted per cleanup.json,
  digest sidecars verified)

See receipt.json and smoke.txt (PASS) for the workspace/branch/HEAD/hash proof,
and source_evidence.json for the full cross-check table.

## Anchor verdicts

Published wording classification. Details (hashes, rationale) in review.json.

| role | segment | verdict | basis (evidence code; hashes in review.json) |
|---|---|---|---|
| opening | seg-0001 | LIKELY | OPENING-PARTIAL-MATCH: 2 token matches vs garbled adjacent-span ASR, 1 token only phonetically approximate |
| middle | seg-1806 | UNCERTAIN | MIDDLE-SYLLABLE-EXPANSION: published expands ASR proper-noun phrase 4->6 syllables; context-supported, audio-unverifiable |
| ending | seg-3669 | UNCERTAIN | ENDING-HOMOPHONE-DIVERGENCE: 2 divergent homophone/approximate token pairs; no internal source artifact verifies the verse |
| question | seg-0145 | UNCERTAIN | QUESTION-ADJACENT-SPAN: clip captured adjacent seg-0144 cue content instead of the published segment text |
| teacher-summary | seg-0208 | CONFIRMED | VERBATIM-PHRASE-MATCH: published text reproduces an exact 7-char private ASR phrase (punctuation/traditional-conversion only) |

## Corrections

No automatic edits. For every anchor, the private audio text plus
manifest-referenced source artifacts did not jointly support a replacement, so
the published text is preserved (correction.decision = "none", applied = false).
The middle and ending anchors warrant human review: the published readings are
context-plausible but audio-unverifiable at the clipped span.

## Gate

READY_FOR_INDEPENDENT_REVIEW — not published, not accepted.
