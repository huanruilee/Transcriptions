# Prototype-11 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 11, video `7iJMqkgBi8g`.
The source title identifies it as **第 6 講 探究有無世間造物主（上）**.

## Verified

- 4,633 non-empty monotonic ASR segments.
- Audio duration: 9,892.908118 seconds; source size: 306,976,803 bytes.
- Audio SHA-256: `f7502426dfa240b85932aa4d4d616f36e7a7793536e477556f7e478544093dc0`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, Chinese.
- Audio coverage: 99.8506%; source identity matches the playlist inventory.
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
