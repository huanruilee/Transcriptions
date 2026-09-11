# Playlist-01 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 1, video `7QA1k4uxxV0`.
The source title identifies it as **第 1 講 調整學法的動機（上）**.

## Verified

- 3,669 non-empty monotonic ASR segments.
- Audio duration: 8,878.706939 seconds; source size: 310,197,471 bytes.
- Audio SHA-256: `7f71e56ca2e1191f4ac25141f1a7744ba4d2b3c6d80890578267fdc4dde38472`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 99.127%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

The content candidate contains 41 question/teacher-summary pairs. Candidate
acceptance verified timing preservation, Traditional Chinese output, strict
post-question summary boundaries, acoustic corrections for five flagged
segments, provenance hashes, and exclusion of ambiguous speaker spans.

The candidate is suitable for review, but publication remains **BLOCKED** by
`content_review_manifest.json` until the human production-content gate is
explicitly accepted.
