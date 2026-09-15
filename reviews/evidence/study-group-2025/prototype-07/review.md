# Prototype-07 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 7, video `V_1vh1memNo`.
The source title identifies it as **第 4 講 皈依世尊前的省思（上）**.

## Verified

- 5,358 non-empty monotonic ASR segments.
- Audio duration: 10,762.170340 seconds; source size: 318,368,275 bytes.
- Audio SHA-256: `b04ee4b16fa6604dc29f03846b022515c90c51b8403cd2d0db81422ba4f3719e`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, Chinese.
- Audio coverage: 99.7749%; source identity matches the playlist inventory.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. In addition, the 8010 service returned no word-level timestamps
(`totalWordTokens=0`), so this artifact is not sufficient for word-level
alignment or publication. No missing word timestamps or content have been
invented.

The ASR evidence is preserved, but the prototype/publication gate is
**BLOCKED** pending a word-timestamp-capable rerun and human speaker/content
review.
