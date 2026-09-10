# Prototype-31 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 31, video `XoiGo0I6cCk`.
The source title identifies it as **第 16 講 介紹特殊因與近取因（下）**.

## Verified

- 4,436 non-empty monotonic ASR segments.
- Audio duration: 10,208.142222 seconds; source size: 208,543,895 bytes.
- Audio SHA-256: `b796f1660e320709ddf77a2838d2606af7042d8a86e0a75de99150c55e19a132`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 99.1737%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The configured GPU ASR service returned sentence timestamps only and no
word-level timestamps (`totalWordTokens=0`), so this artifact is not sufficient
for word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.
