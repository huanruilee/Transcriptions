# Prototype-21 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 21, video `eTGhBkPOgxA`.
The source title identifies it as **第 11 講 關於祈請與依師的內省（下）**.

## Verified

- 3,951 non-empty monotonic ASR segments.
- Audio duration: 9,857.985306 seconds; source size: 190,494,711 bytes.
- Audio SHA-256: `219a7529e67330a3505e237f86e90363e6dc4c1b0e329287603e48611155c683`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 99.0065%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.

