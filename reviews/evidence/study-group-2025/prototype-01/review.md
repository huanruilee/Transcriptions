# Prototype-01 Review — Blocked (rev 3)

Status: **BLOCKED**

This prototype is a machine-only artifact produced with local Qwen3-8B/27B LLM audit.
No independent human reviewer has signed off on the question set, the guidance bullets,
or the source-segment attributions. It must not be treated as publication-ready.

## What changed since rev 2

rev 2 emitted 26 (question, summary) pairs. The local test failed because:

- some bullets were paraphrased rather than taken from the cited segment text
- sourceSegmentIds for `q-04` and `q-11` were empty
- some bullets pointed at the question's own trailing segment

rev 3 fixed the contract by:

1. re-prompting Qwen to return **exact segment IDs and verbatim quotes** for the
   teacher-response passages
2. requiring each cited segment to exist, to be **strictly after** the question's
   last segment, and to contain the bullet text as an exact substring
3. dropping any (question, summary) pair that failed any of the above

## Source

- playlistIndex: 1
- videoId: `7QA1k4uxxV0`
- title: 第1講 調整學法的動機（上）｜2025《釋量論・第二品》大組共學
- sourceUrl: https://www.youtube.com/watch?v=7QA1k4uxxV0
- playlistUrl: https://www.youtube.com/playlist?list=PLlVfdhU37xZCXzlW90v10Y6z8w3Oue0Uh

## Counts (rev 3)

- audioDurationSeconds: 8878.7
- segments: 2769 (untouched)
- word-tokens (raw ASR): 23164
- **questionIndex entries: 22** (rev 2: 26)
- **teacherSummaries entries: 22** (rev 2: 26) — 1:1 with questionIndex
- excluded total: **71** (rev 2: 67)
    - 40 not-real questions (rev 1)
    - 9 real but no extractable teacher guidance (rev 1)
    - 18 LLM parse failures (rev 1)
    - **4 dropped in rev 3** for failing strict source-attribution validation
      (q-03 / q-10 / q-11 / q-15 — Qwen cited no after-question teacher segment, or
      cited segments that did not satisfy the substring / "after question" test)

## ASR

- engine: faster-whisper
- model: medium
- compute_type: int8
- device: cuda (GB10, sm_121)
- language: zh
- elapsed_seconds: 351.8
- rtf: 0.0396
- word_timestamps: true
- vad_filter: false

## Audio

- audioSha256: `7f71e56ca2e1191f4ac25141f1a7744ba4d2b3c6d80890578267fdc4dde38472`
- container: mp4 (yt-dlp format 18, h264 + aac, 44.1 kHz stereo, 310197471 bytes)
- temporaryAudioDeleted: true

## Audit pipeline (rev 3)

1. rev 1 produced 93 regex candidates; rev 2 used Qwen to keep 26.
2. For rev 3, each of the 26 was re-prompted with:
   ```
   "從對話轉寫中找出問題之後的法師明確回應段落。
    每個引用附 segment id (格式 seg-XXXX)。
    嚴格只輸出 JSON。"
   ```
3. Each LLM-cited (segment_id, quote) was validated:
    - segment_id exists in `segments[]`
    - segment's index > question's last segment index (strictly after)
    - `quote` is an exact substring of the cited segment's text (otherwise the
      full segment text is used as the bullet — never paraphrased)
4. Items failing any check were dropped; 4 removals in rev 3.

Audit evidence: `/tmp/llm_audit_v4.jsonl` (26 records, full LLM verdicts).
Audit model: Qwen3-8B/27B (vLLM local @ 127.0.0.1:8001).

## Validation (programmatic)

- JSON parses: raw_asr.json + candidate.json
- monotonic timestamps: 0 violations
- empty segment text: 0
- audio coverage: 100.00%
- **22 questions = 22 summaries** (1:1 invariant)
- **every bullet is an exact substring of its cited source-segment text**
  (0 failures across 22 × average 2.5 bullets = ~55 substring checks)
- all `questionIndex.segmentIds` and `teacherSummaries.sourceSegmentIds` resolve
  to existing segment ids
- qualityGates.sourceIdentity = "7QA1k4uxxV0"
- qualityGates.temporaryAudioDeleted = true
- qualityGates.teacherSummariesOnePerQuestion = true
- qualityGates.allBulletsAreExactSubstringOfCitedSourceText = true
- raw_asr.audioSha256 matches candidate.audioSha256

## Removed in rev 3 (with reason)

| qid   | reason |
|-------|--------|
| q-03  | Qwen: 後續段落為提問者延伸補充及另一位同學的新提問,未見法師明確回應 |
| q-10  | Qwen: 後續僅有「這一點我認同啊」簡單認同與阿底峽尊者敘事,未對「佛法順序顛倒」給出法義回應 |
| q-11  | Qwen: 後續為提問者延伸與新問題,未見法師明確回應 |
| q-15  | Qwen: 後續為學生追問過程,簡短回答帶推測語氣且立即被質疑,無法確認為法師明確回應 |

## Unresolved ASR risks

These are observed in the source ASR and not corrected. Per spec, words are
never substituted without repository evidence; these are flagged for human
review of the raw ASR, not for candidate.json edits.

- seg-0001 「敬禮法師（各位同學,大家晚安。」 — stray `（`
- seg-0003..0010 「南盟本師釋迦牟尼佛」 repeated three times as opening liturgy;
  likely 「南無」(not corrected in segments[]; not material to questions/summaries)
- q-21 (rev 2) label 「我們都限不出他的功德」 — likely 「稱」
- several q-XX labels contain student paraphrasing that may not match any
  exact ASR segment — these labels were regenerated from the trailing question
  segment text in rev 2; reviewer should check whether they are the literal
  question or a student paraphrase

## Limitations (carried forward)

1. **No independent human review.** A Buddhist-domain reviewer must validate the 22
   (question, guidance) pairs and the 71 exclusions before any downstream use.
2. **LLM-only attribution.** Qwen3-8B/27B is the sole authority for "this segment
   is the teacher responding to that question". Its verdicts are stored verbatim
   in `/tmp/llm_audit_v4.jsonl` so a human can override any pair.
3. **rev 3 dropped 4 (q-03 / q-10 / q-11 / q-15)** because Qwen could not point at
   a clearly teacher-attributable post-question segment. A reviewer with audio
   access may be able to recover them.
4. **Model downgrade.** large-v3-turbo OOM'd alongside the resident vLLM; medium
   int8 was used. Quality is below the reference target.
5. **VAD disabled.** Silero VAD hung in PyTorch on sm_121.
6. **Q-01 attribution in rev 3**: cited segs 0491–0493 read either as teacher
   rephrasing the student or as a student continuing the thread; Qwen classified
   them as teacher. Without audio this is not verifiable. Reviewer must confirm.

## Artifact paths

- `/home/henry/.gx10/xiaofa/workspace/Transcriptions/reviews/evidence/study-group-2025/prototype-01/raw_asr.json`
- `/home/henry/.gx10/xiaofa/workspace/Transcriptions/reviews/evidence/study-group-2025/prototype-01/candidate.json`
- `/home/henry/.gx10/xiaofa/workspace/Transcriptions/reviews/evidence/study-group-2025/prototype-01/review.md`

Audit evidence (outside the prototype dir, for human review):

- `/tmp/llm_audit_v4.jsonl` — full LLM verdicts and quoted segments

## Recommended next actions

1. Human audit of the 22 (question, guidance) pairs — pay attention to q-01
   attribution (item 6 above).
2. Re-evaluate the 4 dropped questions (q-03 / q-10 / q-11 / q-15) with audio
   access or a tighter prompt.
3. Targeted ASR corrections for 南無, 敬禮法師（, 限→稱 — only after
   confirming against in-repo scripture sources.
4. Upgrade this review to PASS only after items 1–3 are signed off.
