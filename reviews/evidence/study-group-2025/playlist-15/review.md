# Prototype-15 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 15, video `Yj-phMhCeGA`.
The source title identifies it as **第 8 講 如何判別因果關係（下）**.

## Verified

- 4,044 non-empty monotonic ASR segments.
- Audio duration: 9,921.538322 seconds; source size: 341,409,185 bytes.
- Audio SHA-256: `f7025c6f617f08872b2788d9ad29732a28261adba02933a741f7f9e6bd824c12`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 99.2282%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication. No missing word timestamps or content have
been invented.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.
