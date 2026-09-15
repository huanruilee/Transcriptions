# Prototype-32 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 32, video `T_YckC3PK7g`.
The source title identifies it as **第 17 講 前後世的辨析與總攝（上）**.

## Verified

- 4,233 non-empty monotonic ASR segments.
- Audio duration: 10,509.351474 seconds; source size: 277,664,850 bytes.
- Audio SHA-256: `e0e0d0a418a2f2fc70d691d84a0e5769ce72fff8bcaa615b5f2b17f8b5507550`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 98.0795%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The configured GPU ASR service returned sentence timestamps only and no
word-level timestamps (`totalWordTokens=0`), so this artifact is not sufficient
for word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.
