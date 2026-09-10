# Prototype-02 Review — Blocked (rev 1)

Status: **BLOCKED**

This prototype is an ASR-only artifact. No question attribution, no teacher
summary, and no human reviewer sign-off exist. It must not be treated as
publication-ready. The deliverable is a verified transcript of `bO2f8SL6czc`
that downstream question-extraction work (with audio + speaker-role evidence
or human review) can build on.

## Source

- playlistIndex: 2
- videoId: `bO2f8SL6czc`
- title: 第1講 調整學法的動機（下）｜2025《釋量論・第二品》大組共學
- sourceUrl: https://www.youtube.com/watch?v=bO2f8SL6czc
- playlistUrl: https://www.youtube.com/playlist?list=PLlVfdhU37xZCXzlW90v10Y6z8w3Oue0Uh

## ASR

- engine: faster-whisper
- model: medium
- compute_type: int8
- device: cuda (GB10, sm_121)
- language: zh
- elapsed_seconds: 477.974
- rtf: 0.04957
- word_timestamps: true
- vad_filter: false

## Counts

- audioDurationSeconds: 9641.95 (ffprobe 9641.946848, candidate 9641.946875)
- **segments: 3594** (id-stable, `seg-0001` … `seg-3594`)
- **word tokens: 26574** (faster-whisper `word_timestamps` tokenization, per
  `run_manifest.json` `commands[2].note` and `checks.totalWordTokens`).
  Surface whitespace-split is 3615 — the pipeline figure is authoritative.
- audio coverage: 99.9029 % (last segment ends at 9632.58 s vs. audio 9641.95 s;
  trailing ~9.4 s is final silence / breath, no transcribed segments)

## Audio

- audioSha256: `c1c18d488aa4dd016a83d5eb360c718a40e7bafa3fb6130af5b983542bfcfd11`
- bytes: 289454609
- container: mp4 (yt-dlp format 18, h264 + aac)
- **temporaryAudioDeleted: true** (`/tmp/proto02_audio/source.mp4` removed
  after ASR; the entire `/tmp/proto02_audio/` directory was removed with it)

## Deterministic checks (all pass)

Programmatic re-verification against `raw_asr.json` + `candidate.json`
+ `run_manifest.json` on this run:

- videoId matches across candidate / manifest (`bO2f8SL6czc`)
- audioSha256 matches across candidate provenance and manifest command note
- source URL matches `https://www.youtube.com/watch?v=bO2f8SL6czc`
- JSON parses for all three artifacts
- segments: 3594 (matches manifest)
- word tokens: 26574 per `checks.totalWordTokens` (matches manifest)
- **monotonic timestamps: 0 violations** across all 3594 segments
- **unique segment ids: 3594/3594** (no dup)
- **empty-text segments: 0**
- audio coverage: 99.9029 %
- questionIndex length: 0
- teacherSummaries length: 0
- `exclusions[0]` documents the empty `questionIndex` /
  `teacherSummaries` decision with full rationale (BLOCKED, awaiting
  speaker-role evidence)
- `run_manifest.status`: `ASR_OK`

## Unresolved ASR risks

Observed in the source ASR and not corrected. Per spec, words are never
substituted without repository evidence; these are flagged for human review
of the raw ASR, not for `candidate.json` edits.

- **seg-3593** (9627.9–9629.3 s, closing line): 「我們一起來做**回項**」 —
  almost certainly 「我們一起來做**回向**」. 「回向」 is the standard
  Buddhist-dedication liturgy at session close; 「回項」 is not a term. This
  is the only occurrence of 「回項」 in the transcript and sits in the very
  last segment, which is consistent with a final dedication formula.
- The opening of seg-0001 reads 「**禮靜**法師,同學們晚安,那我們開始今晚的
  共學,請大家合掌」 — likely 「**禮敬**」 (or 「**敬禮**」); 「禮靜」 is not
  a known address term and 「禮敬」 / 「敬禮」 is. This matches a pattern also
  observed in prototype-01.
- seg-0002 / seg-0003 「**南無**本師釋迦牟尼佛」 — these are correctly
  transcribed (sanity check; prototype-01 had similar repetitions).
- Other risk spots were scanned (回像 / 悔向 / 涅盤 / 班智達) and were not
  observed in this transcript; 「回項」 is the single clear homophone
  candidate flagged here.

## Limitations (hard)

1. **No question / teacher summary candidates.** `questionIndex` is empty
   and `teacherSummaries` is empty in `candidate.json`. This is by design:
   the task spec for prototype-02 is explicit that
   *"question index may be empty or UNRESOLVED; never claim teacher
   summaries without proof of speaker role."*
2. **Speaker roles are not proven.** Without diarization or a human listener
   who can distinguish 禮靜法師 / 法師 / 提問同學 / 其他同學 in audio,
   attributing any segment to the teacher (as opposed to a student
   paraphrasing, agreeing, or extending) is not possible from this transcript
   alone. This is the hard blocker that keeps the prototype BLOCKED.
3. **No independent human review.** A Buddhist-domain reviewer must audit
   the ASR, validate any future question/summary pairs, and confirm the
   「回項」 → 「回向」 correction against audio before publication.
4. **Model downgrade.** `large-v3-turbo` OOM'd alongside the resident vLLM;
   `medium` int8 was used. Quality is below the reference target.
5. **VAD disabled.** Silero VAD hung in PyTorch on sm_121.

## Cleanup (verified)

Cleanup actions taken before this review:

- `/tmp/proto02_audio/` — already absent on disk at this review run
  (directory and its `source.mp4` were removed at ASR time per
  `run_manifest.cleanup.removedPaths`).
- `/tmp/study-group-diarization-v2/` — absent on disk at this review run
  (no disposable diarization environment was left behind by the ASR step).
- `/home/henry/.local/share/probe18.partial.archived` — **removed this run**
  (157035394 bytes; present at review start, absent at review end).
- Helper script `/tmp/proto02_review_check.py` created by this review run
  for invariant verification — **removed** at review end.

Re-verification after cleanup (all absent):

```
absent: /tmp/proto02_audio
absent: /tmp/study-group-diarization-v2
absent: /home/henry/.local/share/probe18.partial.archived
absent: /tmp/proto02_review_check.py
```

No tests, inventory, course files, or other sessions were modified by this
review. Only files inside `reviews/evidence/study-group-2025/prototype-02/`
were written (this `review.md`), and only disposable `/tmp/` /
`~/.local/share/` artifacts listed above were removed.

## Artifact paths

- `/home/henry/.gx10/xiaofa/workspace/Transcriptions/reviews/evidence/study-group-2025/prototype-02/raw_asr.json`
- `/home/henry/.gx10/xiaofa/workspace/Transcriptions/reviews/evidence/study-group-2025/prototype-02/candidate.json`
- `/home/henry/.gx10/xiaofa/workspace/Transcriptions/reviews/evidence/study-group-2025/prototype-02/run_manifest.json`
- `/home/henry/.gx10/xiaofa/workspace/Transcriptions/reviews/evidence/study-group-2025/prototype-02/review.md`

## Recommended next actions

1. **Add speaker-role evidence** (diarization with overlap-aware model, or a
   human listener who can tag teacher vs. student turns) before any
   question-extraction work on this transcript.
2. **Human audit of the 「回項」 / 「回向」 correction** at seg-3593 against
   audio, plus the 「禮靜」 / 「禮敬」 opening of seg-0001.
3. **Upgrade this review to PASS only after items 1–2 are signed off** and
   `questionIndex` / `teacherSummaries` are populated and validated.
