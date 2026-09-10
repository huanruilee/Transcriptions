# Prototype-37 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 37, video `DbBo5ZedMVg`.
The source title identifies it as **第 24 講 苦諦的四種行相（上）**.

## Verified

- 4,109 non-empty monotonic ASR segments.
- Audio duration: 9,990.292608 seconds; source size: 156,312,755 bytes.
- Audio SHA-256: `8df57161da96b132123195d029f42d2c07bbf12f28ff3120836ea2ca7a663928`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 99.1286%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The configured GPU ASR service returned sentence timestamps only and no
word-level timestamps (`totalWordTokens=0`), so this artifact is not sufficient
for word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.
