# Prototype-25 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 25, video `s0NCb1KDwV0`.
The source title identifies it as **第 13 講 分析有無前後世（下）**.

## Verified

- 4,234 non-empty monotonic ASR segments.
- Audio duration: 10,347.647710 seconds; source size: 176,539,406 bytes.
- Audio SHA-256: `b16ea1de1a55748a706514108e4194f507529e793b01f418814af2f510d94947`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 98.9001%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.

