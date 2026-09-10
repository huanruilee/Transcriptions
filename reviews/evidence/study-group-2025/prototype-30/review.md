# Prototype-30 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 30, video `j88bbDgFvy8`.
The source title identifies it as **第 16 講 介紹特殊因與近取因（上）**.

## Verified

- 4,142 non-empty monotonic ASR segments.
- Audio duration: 10,197.832562 seconds; source size: 221,329,693 bytes.
- Audio SHA-256: `4e97411bb19b3685059a6c317d0d0a203e463676ba2a977f9e4d8555d5b71bbc`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 99.2265%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The configured GPU ASR service returned sentence timestamps only and no
word-level timestamps (`totalWordTokens=0`), so this artifact is not sufficient
for word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.
