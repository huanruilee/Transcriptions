# Prototype-23 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 23, video `nainRhshJEI`.
The source title identifies it as **第 12 講 修持大悲的重要性（下）**.

## Verified

- 4,547 non-empty monotonic ASR segments.
- Audio duration: 11,260.424127 seconds; source size: 278,300,944 bytes.
- Audio SHA-256: `00aaedd041f55958519c366ba3252de2970cb943556d8bb6977d2cb417a66d8d`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 98.3598%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.

