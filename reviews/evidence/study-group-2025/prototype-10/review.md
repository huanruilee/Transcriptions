# Prototype-10 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 10, video `VbOU16xYVPY`.
The source title identifies it as **第 5 講 介紹量與量士夫（下）**.

## Verified

- 4,119 non-empty monotonic ASR segments.
- Audio duration: 9,481.148662 seconds; source size: 242,046,619 bytes.
- Audio SHA-256: `99838a1b4bfd5b1f334cbc85b1f73a71c17eef9e86d30d785472b5cbd185628c`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, Chinese.
- Audio coverage: 99.7840%; source identity matches the playlist inventory.
- Inventory duration is a rounded display value; the precise ffprobe duration
  is retained in the manifest and provenance fields.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication. No missing word timestamps or content have
been invented.

The ASR evidence is preserved, but the prototype/publication gate is
**BLOCKED** pending a word-timestamp-capable rerun and human speaker/content
review.
