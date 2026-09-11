# Prototype-28 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 28, video `wXKaQ9ygdd4`.
The source title identifies it as **第 15 講 探討身心如何運作（上）**.

## Verified

- 4,351 non-empty monotonic ASR segments.
- Audio duration: 9,856.127710 seconds; source size: 154,205,874 bytes.
- Audio SHA-256: `1b17e0377a098180651e95929866ad4e341004202635e3e24c3f7c2b9a653007`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 98.7616%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.

