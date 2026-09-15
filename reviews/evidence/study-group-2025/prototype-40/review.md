# Prototype-40 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 40, video `_gPAgRMUgkA`.
The source title identifies it as **第 25 講 集諦的前三種行相（下）**.

## Verified

- 4,240 non-empty monotonic ASR segments.
- Audio duration: 10,220.170159 seconds; source size: 240,140,893 bytes.
- Audio SHA-256: `25b816f1a34ac472cd50836e5fe84c2e20f3cea8fb8a350174962acb9e477041`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 99.1708%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The configured GPU ASR service returned sentence timestamps only and no
word-level timestamps (`totalWordTokens=0`), so this artifact is not sufficient
for word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.
