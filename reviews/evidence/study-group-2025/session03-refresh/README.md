# STUDYGROUP03-REFRESH-01

Scope: session_03 = 第2講（上）如何探究真相, video `_mEd_2G8glg`.
Baseline: origin/main `0eae43c`; baseline-session.json preserves every prior rawText.
Authorization: user requested correction through production publication on 2026-11-26.
Authority: TRANSCRIPTION_WORKFLOW v1.13 (updated from v1.12 during execution) and course COURSE_GUIDE, 2026-11-26.

## Sources and boundaries

- Official video description and chapters: official-video.json, fetched via yt-dlp 2026-11-26. Three actual questions, twelve official chapters. Upload channel 如理作意; description identifies original 如來法性影音頻道 and instructor 如性法師. Institution/abbot is not identified; no institutional name was inferred.
- 正行教材: `courses/釋量論第二品/source_text/session_02_official_raw.txt`; terminology/reference only, not a substitute for this 2025 discussion recording. Legacy playlist-03 manifest incorrectly points to session_03; it remains historical evidence and is superseded for this task.
- Course outline: `source_outlines/32-02.json`; 32-03 is a different lecture.
- Audio: temporary GX10 `/tmp/codex-session03/exact.m4a`, format 140, 9902.405079s (video 9902s). A lower-bitrate fragmented source was 9927.502256s and was REJECTED for timeline work. No audio is committed or uploaded to Drive.
- ASR: local CUDA faster-whisper-large-v3-turbo, int8 (actual /health identity); raw and guided outputs kept separately. These are AI audio checks, not human sentence-by-sentence listening.
- Full-course baseline audit identifies historical debt; scope is only session_03. Locked sessions 01 and 四念住08 are untouched.

## Content decisions

Three questions replace the erroneous five-question projection. Speaker attribution uses official teacher windows, explicit handoffs and conversational turns, with local Re-ASR handoff probes; this is not human diarization approval. Teacher summaries are rewritten from actual teacher reasoning, including the concluding limitation on question 3.

Raw text survives in baseline and merged rawText/sourceSentenceIds. Pure-filler deletions are listed in editorial-ledger.json. Added chants have re-asr IDs and source provenance. Publication stays candidate-review-required; no humanListened claim is made.

The old time-zero verse/scaffolding template has no matching lecture evidence and is removed. The v4 guide provides source-linked learning cards instead.

## Gates

Baseline RED: red.log and session03-baseline-radar.json. Final gates, independent review, exact merge/deployed SHA and browser evidence are recorded at closeout. No gate is implied complete by this document's existence.

Independent full large-v3 raw/guided window comparisons supplement turbo. The studentsummary-large output invents a donation phrase and is rejected; the source student summary remains flagged rather than replaced by that hallucination. Intermediate mutation scripts are intentionally not distributed as a rerunnable pipeline: the final production artifact, immutable baseline, candidate inputs and complete editorial ledger are the review record.
