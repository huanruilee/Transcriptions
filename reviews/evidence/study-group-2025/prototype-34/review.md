# Prototype-34 Review

Status: **BLOCKED**

This is a sentence-level ASR artifact for playlist index 34, video `-m6sV_rS1bU`.
The source title identifies it as **前後世學習回顧與自我省思**.

## Verified

- 3,573 non-empty monotonic ASR segments.
- Audio duration: 10,406.905034 seconds; source size: 175,022,144 bytes.
- Audio SHA-256: `14efa95d550a6ef337c0c2235e1bcc8ac0728947358a8ef9776c5e53204c9698`.
- GPU Whisper service: `faster-whisper large-v3-turbo`, CUDA/int8, with the
  hallucination guard parameters recorded in the manifest.
- Audio coverage: 98.5471%; repeated-character segment count: **0**.
- Temporary audio and disposable GX10 task directory were deleted after retrieval.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty because speaker roles are not
proven. The configured GPU ASR service returned sentence timestamps only and no
word-level timestamps (`totalWordTokens=0`), so this artifact is not sufficient
for word-level alignment or publication.

The ASR evidence passes the machine hallucination gate, but publication remains
**BLOCKED** pending human speaker/content review.
