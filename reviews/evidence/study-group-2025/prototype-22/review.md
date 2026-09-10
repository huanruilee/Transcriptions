# Prototype-22 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 22, video `ZmTWgK8MFfM`.
The source title identifies it as **第 12 講 修持大悲的重要性（上）**.

## Verified

- 4,297 non-empty monotonic ASR segments.
- Audio duration: 10,221.424036 seconds; source size: 256,981,230 bytes.
- Audio SHA-256: `b46a528bf072a8b5c15ee4b3f0c906cc12d78751fbe28d8b4e91514b9077f085`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 98.5901%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.

