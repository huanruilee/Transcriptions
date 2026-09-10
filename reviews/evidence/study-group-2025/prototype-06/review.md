# Prototype-06 Review

Status: **BLOCKED**

This is an ASR-only artifact for playlist index 6, video `N0T2AfsrbaE`.
The source title identifies it as **第 3 講 略述集量論的禮讚文（下）**;
no lecture number was invented beyond the source inventory.

## Verified

- 3,660 segments and 27,409 word timestamps.
- Audio duration: 10,133.838367 seconds; declared duration: 10,134 seconds.
- Coverage: 99.8932%; the first speech begins at about 20.84 seconds and the
  closing speech ends about 12 seconds before the media end.
- Source size: 317,968,513 bytes.
- Audio SHA-256: `51bd3b7689448c84e8d7f73fc93a1d6d3d565eafd76bda43dce40ec7532f3d3e`.
- `faster-whisper medium/int8`, Chinese, word timestamps enabled, VAD disabled.
- Raw/candidate source identity, segment IDs, timestamps, non-empty text and
  cleanup metadata are consistent with the manifest.
- Temporary audio and scratch directory were deleted on GX10.

## Gate decision

`questionIndex` and `teacherSummaries` remain empty by design. No diarization or
human speaker-role confirmation exists, so the content cannot yet be published
as a question-indexed study transcript or teacher guidance. The opening begins
mid-stream and the closing liturgy requires human listening review.

The ASR evidence is complete, but the prototype/publication gate is **BLOCKED**.
The GX10 Agent encountered provider API rate limiting while attempting its final
review write; this does not invalidate the already completed ASR artifacts.
