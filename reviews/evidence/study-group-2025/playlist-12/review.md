# Prototype-12 Review

Status: **BLOCKED**

This is the accepted ASR rerun for playlist index 12, video `9ew8eXJc2Nk`.
The source title identifies it as **第 6 講 探究有無世間造物主（下）**.

## Verified

- 4,144 non-empty monotonic ASR segments.
- Audio duration: 9,725.863764 seconds; source size: 209,463,743 bytes.
- Audio SHA-256: `59588626433648d08636e94213a669c260088c675ad86c598dc41d524c02de77`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 98.3750%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.
- The failed first attempt is preserved under `failed-attempt-01/`.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication. No missing word timestamps or content have
been invented.

The stronger rerun passes the repeated-character gate, but its lower measured
sentence coverage and lack of word timestamps require human audio review before
publication. Publication remains **BLOCKED**.
