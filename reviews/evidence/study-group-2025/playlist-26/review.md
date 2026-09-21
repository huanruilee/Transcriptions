# Prototype-26 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 26, video `uFmVc19pIqs`.
The source title identifies it as **第 14 講 五根與意知的關係（上）**.

## Verified

- 4,132 non-empty monotonic ASR segments.
- Audio duration: 9,668.510476 seconds; source size: 227,409,993 bytes.
- Audio SHA-256: `477db6d1254ab1e0e5b0cf063a8c646d022d014f9268094a843910dcc4227bc7`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 99.1588%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.

