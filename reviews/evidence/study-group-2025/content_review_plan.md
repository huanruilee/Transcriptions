# 2025 大組共學內容整理計畫

Status: `M0 SPECIFIED`

## Scope

Prototype only: playlist index 1 (`7QA1k4uxxV0`), using the frozen ASR
evidence under `reviews/evidence/study-group-2025/playlist-01/`. Raw ASR and
timestamps are immutable. The remote audio is disposable and must not enter Git.

## Required output

`content_review.json` must preserve every source segment ID, `start`, and `end`,
and provide reviewed Traditional Chinese text. It must contain a non-empty
`questionIndex`; every question must cite source segment IDs and have a matching
`teacherSummaries` entry with bullet points grounded in cited segments. Unclear
speaker attribution or unsupported doctrinal claims remain explicitly flagged,
never silently invented.

## Gates

1. RED: `npm run test:study-group-content` fails because the prototype output is
   absent.
2. GX10 preparation verifies source hashes, model health, and a fixed input
   manifest before semantic processing.
3. Machine checks verify exact segment coverage, timestamp preservation,
   Traditional Chinese output, question/summary referential integrity, and
   non-empty evidence citations.
4. A separate read-only reviewer must PASS before integration and push.

## Prohibited

Do not modify raw ASR, inventory, existing baseline fixtures, or unrelated
course sessions. Do not publish the candidate until content review passes.
