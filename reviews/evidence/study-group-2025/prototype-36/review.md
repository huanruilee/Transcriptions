# Prototype-36 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 36, video `AA6JyKOI1AA`.
The source title identifies it as **第 23 講 四諦與其修持要義（下）**.

## Verified

- 4,127 non-empty monotonic ASR segments.
- Audio duration: 10,188.033741 seconds; source size: 186,604,467 bytes.
- Audio SHA-256: `545725c6577968cb2d1073b6b211e13920032168189cbdd80ee46530f20f711a`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 98.7128%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The configured GPU ASR service returned sentence timestamps only and no
word-level timestamps (`totalWordTokens=0`), so this artifact is not sufficient
for word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.
