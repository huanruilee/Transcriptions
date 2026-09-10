# Prototype-35 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 35, video `Kfrn27RgpXo`.
The source title identifies it as **第 23 講 四諦與其修持要義（上）**.

## Verified

- 4,198 non-empty monotonic ASR segments.
- Audio duration: 9,995.726077 seconds; source size: 156,035,951 bytes.
- Audio SHA-256: `450413db14ff62f3e7ab691f1370ecb5648372226727fd8e5c767d811c0a4aa1`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 98.1041%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The configured GPU ASR service returned sentence timestamps only and no
word-level timestamps (`totalWordTokens=0`), so this artifact is not sufficient
for word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.
