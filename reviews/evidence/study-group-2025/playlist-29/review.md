# Prototype-29 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 29, video `D1-MRY1j844`.
The source title identifies it as **第 15 講 探討身心如何運作（下）**.

## Verified

- 4,262 non-empty monotonic ASR segments.
- Audio duration: 10,165.603265 seconds; source size: 221,362,314 bytes.
- Audio SHA-256: `16fa984840b66d5d02af6f6539fd790242d8e6a3f61566d8cc33f30c3ee44888`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 99.0228%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The configured GPU ASR service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.
