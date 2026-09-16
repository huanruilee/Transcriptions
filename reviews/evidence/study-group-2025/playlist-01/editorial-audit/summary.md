# Study Group Session 01 — Editorial Evidence Adjudication (playlist-01)

Status: READY_FOR_INDEPENDENT_REVIEW

Scope: bounded editorial adjudication of five GPU audio anchors for video
7QA1k4uxxV0 (session 01). No audio was downloaded, no ASR was called, no
external sources were accessed, and no transcript/session content was
modified. All transcript evidence in this directory is hash-only.

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

| role | segment | verdict | basis |
|---|---|---|---|
| opening | seg-0001 | LIKELY | ASR matches 法師/同學大家晚安; 各位 only phonetically approximates garbled ASR |
| middle | seg-1806 | UNCERTAIN | audio has 4-syllable 欺佛之师; published expands to 6-syllable 釋迦牟尼佛之師 — context-supported, audio-unverifiable |
| ending | seg-3669 | UNCERTAIN | ASR homophones 善事赦受医 vs published 善逝受持義; no internal source artifact verifies the verse |
| question | seg-0145 | UNCERTAIN | clip captured adjacent seg-0144 content (第一题) instead of the published segment text |
| teacher-summary | seg-0208 | CONFIRMED | published text reproduces the private ASR phrase verbatim (punctuation/traditional-conversion only) |

## Corrections

No automatic edits. For every anchor, the private audio text plus
manifest-referenced source artifacts did not jointly support a replacement, so
the published text is preserved (correction.decision = "none", applied = false).
The middle and ending anchors warrant human review: the published readings are
context-plausible but audio-unverifiable at the clipped span.

## Gate

READY_FOR_INDEPENDENT_REVIEW — not published, not accepted.
