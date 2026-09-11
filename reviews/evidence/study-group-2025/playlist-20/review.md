# Prototype-20 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 20, video `kngthKXpN6M`.
The source title identifies it as **第 11 講 關於祈請與依師的內省（上）**.

## Verified

- 4,509 non-empty monotonic ASR segments.
- Audio duration: 10,534.289705 seconds; source size: 202,958,014 bytes.
- Audio SHA-256: `1f1800806323ac31a3a4089ffc59edba49dcf7c59e8f1cb99912046aa410d429`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 99.1341%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The 8010 service returned sentence timestamps only and no word-level
timestamps (`totalWordTokens=0`), so this artifact is not sufficient for
word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.

