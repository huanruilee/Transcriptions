# Prototype-17 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 17, video `8_HnlssRYbs`.
The source title identifies it as **第 9 講 深究遍智存在與否（下）**.

## Verified

- 4,409 non-empty monotonic ASR segments.
- Audio duration: 10,663.253333 seconds; source size: 269,943,329 bytes.
- Audio SHA-256: `f0aee2a487fa134835bf98a858397633a8d891e11d6e0b21ca9806f56a475eae`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 99.1787%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication. No missing word timestamps or content have
been invented.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.

