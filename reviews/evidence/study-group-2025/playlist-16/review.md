# Prototype-16 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 16, video `iFRIilKgCWc`.
The source title identifies it as **第 9 講 深究遍智存在與否（上）**.

## Verified

- 4,240 non-empty monotonic ASR segments.
- Audio duration: 10,024.751020 seconds; source size: 295,331,458 bytes.
- Audio SHA-256: `b71739acdee6f896de2c3ece0d6e9bc7fda5c3c4f58a4b1aaef647ed03718536`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 99.1414%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication. No missing word timestamps or content have
been invented.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.
