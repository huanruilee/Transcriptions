# Prototype-13 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 13, video `dT_f_FGivnU`.
The source title is **第7講 學法時應反觀自心**; the inventory intentionally
does not invent a lecture-number normalization for this review entry.

## Verified

- 4,285 non-empty monotonic ASR segments.
- Audio duration: 10,048.040635 seconds; source size: 309,500,814 bytes.
- Audio SHA-256: `33a751ffe898b75a55ea6a7c041f3ede68bd063c1fa82da2664908d8a2781e59`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 99.1769%; repeated-character segment count: **0**.
- The playlist duration is a rounded display value; the precise ffprobe duration
  is retained in the manifest and provenance fields.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication. No missing word timestamps or content have
been invented.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.
