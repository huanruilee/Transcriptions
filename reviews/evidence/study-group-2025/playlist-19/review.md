# Prototype-19 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 19, video `2lTBsCdafpc`.
The source title identifies it as **第 10 講 依師前的基本觀念（下）**.

## Verified

- 4,501 non-empty monotonic ASR segments.
- Audio duration: 10,391.161905 seconds; source size: 246,913,398 bytes.
- Audio SHA-256: `1e09d945b4fc762b9db307f6365c8ed091644ffb563a4a83de9c38a044cb4133`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 99.061%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.

