# Prototype-24 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 24, video `M6gOg7dr6io`.
The source title identifies it as **第 13 講 分析有無前後世（上）**.

## Verified

- 4,070 non-empty monotonic ASR segments.
- Audio duration: 9,281.480272 seconds; source size: 198,207,692 bytes.
- Audio SHA-256: `8826255bf52c65a7ef57e63b05c7b6682f2402af98fba5cae10064f69f24f2c6`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 99.0733%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.

