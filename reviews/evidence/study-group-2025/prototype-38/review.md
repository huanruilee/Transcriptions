# Prototype-38 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 38, video `-uEGLcrHyGQ`.
The source title identifies it as **第 24 講 苦諦的四種行相（下）**.

## Verified

- 4,134 non-empty monotonic ASR segments.
- Audio duration: 9,803.511293 seconds; source size: 209,050,975 bytes.
- Audio SHA-256: `f601973a2557d61b02ba81163e46ff01cdd1e08fe0840e56d3d277c1c45fa3aa`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 99.099%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The configured GPU ASR service returned sentence timestamps only and no
word-level timestamps (`totalWordTokens=0`), so this artifact is not sufficient
for word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.
