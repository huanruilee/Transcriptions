# Prototype-27 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 27, video `L8AzPxI0YCY`.
The source title identifies it as **第 14 講 五根與意知的關係（下）**.

## Verified

- 3,999 non-empty monotonic ASR segments.
- Audio duration: 9,394.189932 seconds; source size: 234,061,555 bytes.
- Audio SHA-256: `81ffaf79539f8b738ee30c52b0f3616cc46980c184caf92531e2a82d0a418065`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 98.7036%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.

