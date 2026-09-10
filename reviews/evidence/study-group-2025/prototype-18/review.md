# Prototype-18 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 18, video `79fYtB0wPlY`.
The source title identifies it as **第 10 講 依師前的基本觀念（上）**.

## Verified

- 4,397 non-empty monotonic ASR segments.
- Audio duration: 10,006.267937 seconds; source size: 212,930,171 bytes.
- Audio SHA-256: `b3051376beeb95c44f817002d4697660c2f647391c42fb1394ad103b900d547d`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 98.6259%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.

