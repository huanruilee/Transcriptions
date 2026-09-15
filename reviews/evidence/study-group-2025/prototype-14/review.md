# Prototype-14 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 14, video `ZLllHpFN-8M`.
The source title identifies it as **第 8 講 如何判別因果關係（上）**.

## Verified

- 3,960 non-empty monotonic ASR segments.
- Audio duration: 9,752.380952 seconds; source size: 319,635,125 bytes.
- Audio SHA-256: `cb0a3dfac5354fb5027f64f94f770c2af4c0dbb45795b9bd12e13e10a380df94`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 98.4982%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication. No missing word timestamps or content have
been invented.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.
