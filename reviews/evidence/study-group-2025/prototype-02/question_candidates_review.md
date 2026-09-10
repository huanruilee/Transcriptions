# Prototype-02 — Question-Candidates Extraction Review (rev 2)

Status: **BLOCKED**

This review covers only the new artifact
`reviews/evidence/study-group-2025/prototype-02/question_candidates.json`. The
earlier `review.md` (rev 1) covering the ASR pass is unchanged and remains the
authoritative read on the transcript itself; this file documents the
question-candidate extractor pass layered on top of it.

The extractor (`/tmp/build_qc.py`) was **not** re-run. When this review
started, `question_candidates.json` already existed on disk (73481 bytes,
written 2026-09-10T10:18:05Z) and matched the spec's source-of-truth
expectations. Per instructions, the existing JSON was verified read-only and
this review was written without regenerating it or touching the four
immutable inputs.

## Scope of changes (this review run)

- Written: `reviews/evidence/study-group-2025/prototype-02/question_candidates_review.md`
  (this file).
- Read-only inspected: `raw_asr.json`, `candidate.json`, `run_manifest.json`,
  `review.md` (rev 1), `question_candidates.json`, `/tmp/build_qc.py`.
- **Not** modified: `raw_asr.json`, `candidate.json`, `run_manifest.json`,
  `review.md`, `question_candidates.json`, any audio, any session files,
  any other `prototype-*` evidence.

## Counts (read from `question_candidates.json`)

| Metric                              | Value |
| ----------------------------------- | ----- |
| `rawQuestionSegments`               | 243   |
| `runsBeforeExclusion`               | 201   |
| `runsAfterExclusion` (=candidates)  | 157   |
| `excludedCount`                     | 44    |
| `candidates` array length           | 157   |
| `excluded`   array length           | 44    |

By confidence (in `summary`):

| Confidence | Count |
| ---------- | ----- |
| low        | 141   |
| medium     | 16    |

By source kind (in `summary`):

| Source kind          | Count |
| -------------------- | ----- |
| spoken_in_session    | 154   |
| worksheet_reading    | 3     |

Excluded-by-reason (in `summary`):

| Reason                       | Count |
| ---------------------------- | ----- |
| A_bare_confirmation_tag      | 13    |
| B_declarative_false_positive | 27    |
| C_incomplete_asr_fragment    | 3     |
| D_short_rhetorical           | 1     |
| E_meta_narration             | 0 (defined, not triggered) |

Worksheet blocks identified (in `summary`):

- A: 第4提綱 worksheet prompt about 事一之 vs 猶豫之 learning
- B: 學法遇到困難放棄 worksheet prompt (intro + question)
- B: 學法遇到困難放棄 worksheet prompt (paraphrase back)

## Schema

Top-level keys actually present in the file:

```
schema, videoId, sourceUrl, rawTitle, provenance, detectionMethod,
exclusionRules, candidates, excluded, status, statusReason, limitations,
summary
```

- `schema`: `transcriptions/question_candidates/v1`
- Each `candidates[*]` carries exactly these keys (no extras observed):
  `candidateId`, `segmentIds`, `start`, `end`, `text`, `speakerRole`,
  `confidence`, `reviewStatus`, `sourceKind`, `notes`
- `candidateId` format: `qc-0001` … `qc-0157` (zero-padded 4-digit,
  sequential, unique).
- `speakerRole` ∈ `{unresolved}` (every entry, per spec).
- `reviewStatus` ∈ `{human_audio_review_required}` (every entry, per spec).
- `confidence` ∈ `{low, medium}`.
- `sourceKind` ∈ `{spoken_in_session, worksheet_reading}`.
- `excluded[*]` shape: `{segmentIds, text, reason}` with `reason` ∈ the five
  exclusion-rule codes.
- `provenance.extractedAt` is the build-time stamp from the extractor
  (`2026-09-10T10:30:00Z`), not the file mtime — i.e. it is the
  extractor-reported timestamp, not a "we verified at this time" claim.

## Extraction / exclusion rules

Detection (from `extractor.methodology` and `detectionMethod`):

1. Per-segment question cue if the segment ends with `？` / `?`, or contains
   any wh-word (什麼 / 為什麼 / 為何 / 如何 / 怎麼 / 哪裡 / 哪個 / 哪些 /
   哪位 / 誰 / 什麼樣 / 怎樣 / 哪), or ends with a question-tag (是嗎 /
   是吧 / 好嗎 / 行嗎 / 可以嗎 / 知道嗎 / 記得嗎 / 懂嗎 / 會嗎 / 對嗎 /
   對不對 / 是不是 / 可不可以 / 能不能 / 會不會 / 是否).
2. Merge contiguous question-segments into runs, allowing up to 1 bridging
   non-question segment (ASR micro-split tolerance), capped at span length
   20.
3. Worksheet-reading expansion: runs falling inside the three
   teacher-reading-worksheet-prompt blocks are expanded to the full
   contiguous worksheet-reading range and tagged `sourceKind =
   worksheet_reading`.

Inclusion decision (per run, conservative):

| Code | Rule |
| ---- | ---- |
| A_bare_confirmation_tag   | text is just a confirmation tag (是嗎 / 對嗎 / 對不對 / 是不是 / 這樣可以嗎) with no recoverable question content |
| B_declarative_false_positive | segment contains a wh-word but is syntactically declarative (no `？/?` and no terminal question particle) |
| C_incomplete_asr_fragment | segment begins a question but is cut off mid-clause without a terminal question cue |
| D_short_rhetorical        | short rhetorical phrase with no TOC value (e.g. 「應該是吧」 / 「或什麼之類的」) |
| E_meta_narration          | meta-comment naming a question without stating one (e.g. opens 「那請問」 but does not terminate as a question) |

Confidence:

- `low`    — single-segment run without clear interrogative form;
             multi-segment run without terminal question cue; or any
             worksheet-reading run (audio verification always needed).
- `medium` — multi-segment coherent question run with a recoverable full
             clause and clear interrogative form (ends `？/?` or with a
             question particle); or single-segment run with question-
             punctuation support.

Speaker role / review status: by spec, every candidate is
`speakerRole="unresolved"` and `reviewStatus="human_audio_review_required"`.
That is the BLOCKED condition; no candidate is publication-ready.

## Why BLOCKED

Every one of the 157 candidates carries
`speakerRole="unresolved"` and `reviewStatus="human_audio_review_required"`.
There is no diarization in the source ASR (faster-whisper medium int8,
`vad_filter: false`), no overlapping-speaker detector, and no human listener
who has tagged teacher vs. student in audio. The three `worksheet_reading`
candidates additionally need audio verification that the teacher is reading
the printed prompt faithfully — the review cannot confirm boundary text
matches the slide from text alone.

Until speaker-role evidence (diarization, listener tagging, or audio
review) is available, none of these candidates can be promoted to a
`teacherQuestion` / `studentQuestion` taxonomy, no TOC ordering can be
derived, and none can be folded into a candidate.json questionIndex.
That is what keeps this artifact BLOCKED.

## Read-only verification (run as part of this review)

Programmatic checks against `question_candidates.json`:

- JSON parses cleanly.
- All top-level keys present (see Schema section).
- All 9 required fields present on every candidate (missing-field count: 0
  for each).
- `candidateId` matches `^qc-\d{4}$` on every entry (157/157); 157 unique
  values.
- `segmentIds` is a non-empty list on every candidate.
- No timestamp anomalies: every `start`/`end` is numeric, `end >= start`,
  and both fall inside the audio envelope (`<= 9642 s`, matching the rev-1
  coverage check at 99.9029 % of 9641.95 s).
- `speakerRole == "unresolved"` on **157/157** candidates.
- `reviewStatus == "human_audio_review_required"` on **157/157** candidates.
- Self-consistency of the summary block:
  - `summary.totalCandidates (157) == len(candidates) (157)`
  - `byConfidence.low + byConfidence.medium (141 + 16) == 157`
  - `bySourceKind.spoken_in_session + worksheet_reading (154 + 3) == 157`
  - `sum(excludedByReason values) == len(excluded) (44)`
  - `runsBeforeExclusion (201) == runsAfterExclusion (157) + excludedCount (44)`
- `excluded[*].reason` values are a subset of the five `exclusionRules`
  keys; `E_meta_narration` is defined but did not trigger in this pass.

## Immutable inputs — not modified (verified by mtime)

| File                       | Size (B) | mtime (epoch) | mtime (UTC)              |
| -------------------------- | -------- | ------------- | ------------------------ |
| raw_asr.json               | 4223572  | 1789034513    | 2026-09-10T09:55:13Z     |
| candidate.json             | 459813   | 1789034513    | 2026-09-10T09:55:13Z     |
| run_manifest.json          | 2086     | 1789034513    | 2026-09-10T09:55:13Z     |
| review.md (rev 1)          | 7199     | 1789034752    | 2026-09-10T09:59:12Z     |
| question_candidates.json   | 73481    | 1789035485    | 2026-09-10T10:18:05Z     |

The four protected inputs retain the mtimes from the rev-1 ASR /
extractor run earlier today; nothing in this review touched them.
`question_candidates.json` was already on disk before this review started
— it was verified, not regenerated.

## Recommended next actions

1. **Speaker-role evidence.** Acquire diarization (overlap-aware model
   that works on GB10 / sm_121) or have a human listener tag teacher vs.
   student turns in audio. Until then, no candidate can graduate out of
   `speakerRole="unresolved"`.
2. **Human audio review of every candidate.** Either all 157 (costly) or
   a priority subset:
   - The 16 `confidence="medium"` candidates first (highest expected
     yield).
   - The 3 `sourceKind="worksheet_reading"` candidates (need slide-vs-
     audio diff for the printed prompt text).
   - A sample of `confidence="low"` candidates to confirm the extractor
     isn't systematically missing question forms.
3. **Homophone audit.** Before promoting any candidate, verify the
   seg-3593 「回項/回向」 and seg-0001 「禮靜/禮敬」 words against audio
   per rev-1 §Unresolved ASR risks.
4. **Promotion path.** After items 1–3, write `questionIndex` /
   `teacherSummaries` into a new revision of `candidate.json`, run
   `candidate.json` against the rev-1 `review.md` checks again, and only
   then consider unblocking.
