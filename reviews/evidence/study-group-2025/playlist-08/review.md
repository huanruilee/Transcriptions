# Prototype-08 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 8, video `1dWaAT2cHuk`.
The source title identifies it as **第 4 講 皈依世尊前的省思（下）**.

## Verified

- 3,738 non-empty monotonic ASR segments.
- Audio duration: 9,915.547574 seconds; source size: 288,074,521 bytes.
- Audio SHA-256: `acb9d216d7a55cedaefa588abe0fa27d6517478d88748c3e07e41381e2efffe8`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, Chinese.
- Audio coverage: 99.8191%; source identity matches the playlist inventory.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication. No missing word timestamps or content have
been invented.

The ASR evidence is preserved, but the prototype/publication gate is
**BLOCKED** pending a word-timestamp-capable rerun and human speaker/content
review.
