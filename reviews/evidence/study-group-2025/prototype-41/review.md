# Prototype-41 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 41, video `AtYqSdUIXDo`.
The source title identifies it as **第 26 講 集諦與滅諦的行相（上）**.

## Verified

- 3,984 non-empty monotonic ASR segments.
- Audio duration: 9,435.753651 seconds; source size: 247,179,924 bytes.
- Audio SHA-256: `384599f9ea8e00179cb2953ca132cc80a10335756b51dc535ddabffe6c2de6d6`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 98.9082%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The configured GPU ASR service returned sentence timestamps only and no
word-level timestamps (`totalWordTokens=0`), so this artifact is not sufficient
for word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.
