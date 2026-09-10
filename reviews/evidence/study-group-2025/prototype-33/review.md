# Prototype-33 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 33, video `6X3ygKQVK6w`.
The source title identifies it as **第 17 講 前後世的辨析與總攝（下）**.

## Verified

- 4,129 non-empty monotonic ASR segments.
- Audio duration: 10,380.387846 seconds; source size: 248,078,175 bytes.
- Audio SHA-256: `bcfce89f0b8c5eddc3d49be8ba0f87817db29cbf4ad246077e0313beecdb0771`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 99.1918%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The configured GPU ASR service returned sentence timestamps only and no
word-level timestamps (`totalWordTokens=0`), so this artifact is not sufficient
for word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.
