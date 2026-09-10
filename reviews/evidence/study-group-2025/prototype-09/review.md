# Prototype-09 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 9, video `WjcwStayz2Q`.
The source title identifies it as **第 5 講 介紹量與量士夫（上）**.

## Verified

- 3,957 non-empty monotonic ASR segments.
- Audio duration: 9,734.687347 seconds; source size: 336,340,648 bytes.
- Audio SHA-256: `4e07458072a44a1aab32c7099bf0795e62811e859e9ec81e07ba228a7a2c2eda`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, Chinese.
- Audio coverage: 99.7753%; source identity matches the playlist inventory.
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
