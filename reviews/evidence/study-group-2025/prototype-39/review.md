# Prototype-39 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 39, video `lu1dedE3Ncs`.
The source title identifies it as **第 25 講 集諦的前三種行相（上）**.

## Verified

- 4,179 non-empty monotonic ASR segments.
- Audio duration: 9,791.947755 seconds; source size: 261,491,379 bytes.
- Audio SHA-256: `ed22c5ace1cd62b20f62f50d3d685a9424836f2b4c64982767eeeaac14c20226`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 98.3484%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The configured GPU ASR service returned sentence timestamps only and no
word-level timestamps (`totalWordTokens=0`), so this artifact is not sufficient
for word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.
