# Prototype-05 Review — Blocked (rev 1)

Status: **BLOCKED**

This prototype is an ASR-only artifact. No question attribution, no teacher
summary, and no human reviewer sign-off exist. It must not be treated as
publication-ready. The deliverable is a verified transcript of `Ijg4E9LhOdw`
that downstream question-extraction work (with audio + speaker-role evidence
or human review) can build on.

## Source

- playlistIndex: 5
- videoId: `Ijg4E9LhOdw`
- title: 第3講 略述集量論的禮讚文（上）｜2025《釋量論・第二品》大組共學
- sourceUrl: https://www.youtube.com/watch?v=Ijg4E9LhOdw
- playlistUrl: https://www.youtube.com/playlist?list=PLlVfdhU37xZCXzlW90v10Y6z8w3Oue0Uh
- identity provenance: matched against `reviews/evidence/study-group-2025/playlist_inventory.json`
  item 5 (videoId, rawTitle, sourceUrl, playlistIndex all consistent;
  inventory `duration`: 2:36:51 = 156.85 min, matches `declared 9411 s`)

## ASR

- engine: faster-whisper
- model: medium
- compute_type: int8
- device: cuda (GB10, sm_121)
- language: zh
- elapsed_seconds: 475.019
- rtf: 0.05048
- word_timestamps: true
- vad_filter: false
- beam_size: 5

## Counts

- audioDurationSeconds: 9410.68 (ffprobe 9410.6761, candidate / raw ASR 9410.676125)
- declared duration (yt-dlp probe): 9411.0 s
- inventory duration: 2:36:51 (156.85 min) — matches
- **segments: 3412** (id-stable, `seg-0001` … `seg-3412`)
- **word tokens: 25085** (faster-whisper `word_timestamps` tokenization, per
  `run_manifest.json` `commands[4].note` and `checks.totalWordTokens`).
- audio coverage: 99.84 % (last segment ends at 9395.6 s vs. audio 9410.68 s;
  trailing ~15 s is post-「請合掌」 silence / breath, no transcribed segments)

## Audio

- audioSha256: `9122565ed6b1f782f126b659bfb1cb0861a2643b949fab235ea349249014b409`
- bytes: 249522074
- container: mp4 (yt-dlp format 18, h264 + aac)
- downloaded once: yes (single yt-dlp format 18 call; no re-download)
- **temporaryAudioDeleted: true** (`/tmp/proto05_audio/source.mp4` removed
  after ASR; the entire `/tmp/proto05_audio/` directory was removed with it)

## Deterministic checks (all pass)

Programmatic re-verification against `raw_asr.json` + `candidate.json`
+ `run_manifest.json` on this run:

- videoId matches across all three artifacts (`Ijg4E9LhOdw`)
- audioSha256 matches across raw_asr, candidate provenance, manifest command notes
- source URL matches `https://www.youtube.com/watch?v=Ijg4E9LhOdw`
- playlistIndex 5 matches `playlist_inventory.json` item 5
- rawTitle matches inventory: 第3講 略述集量論的禮讚文（上）｜2025《釋量論・第二品》大組共學
- JSON parses for all three artifacts
- segments: 3412 (matches manifest)
- word tokens: 25085 per `checks.totalWordTokens` (matches manifest)
- **monotonic timestamps: 0 violations** across all 3412 segments
- **unique segment ids: 3412/3412** (no dup)
- **empty-text segments: 0**
- audio coverage: 99.84 %
- questionIndex length: 0
- teacherSummaries length: 0
- `exclusions[0]` documents the empty `questionIndex` / `teacherSummaries`
  decision with the BLOCKED speaker-role rationale
- **every raw segment (id, start, end, text) is preserved verbatim in
  candidate.segments** (no silent edits)
- `run_manifest.status`: `ASR_OK`
- `cleanup.temporaryAudioDeleted`: true
- `cleanup.disposableEnvironmentDeleted`: true
- **`artifacts.rawAsrPath` and `artifacts.candidatePath` are repo-relative**
  (`reviews/evidence/study-group-2025/prototype-05/...`), not `/home/henry/...`

## Unresolved ASR risks

Observed in the source ASR and not corrected. Per spec, words are never
substituted without repository evidence; these are flagged for human review
of the raw ASR, not for `candidate.json` edits.

- Opening liturgy captured correctly: seg-0003 「大家請合掌」 then
  seg-0004 / seg-0005 / seg-0006 「南無本師釋迦牟尼佛」(three repetitions,
  matching the standard threefold refuge formula).
- Closing captures 「我們一起來做迴向」(seg-3411) → 「大家請合掌」(seg-3412),
  but trailing ~15 s of audio before 9410.68 s contains the HHDL dedication
  chant itself, which is **not transcribed** by faster-whisper medium
  (Tibetan / Sanskrit phonemes are out-of-distribution for the medium
  zh-only model). Same as prototypes 02 / 03 / 04 — this is a model
  coverage gap, not a transcription bug.
- 「迴向」 correct: 2 hits (seg-0087 「前行…結行的迴向發願」, seg-3411
  「我們一起來做迴向」).
- 「回向」appears once at seg-3047 「然後再回向的時候」 — this is a
  faster-whisper rendering variant (同音 alternative form); contextually
  clear. Same word likely also at seg-0087.
- 掃描風險詞：「南無」3、「合掌」2、「迴向」2、「回向」1、「禮讚」0、
  「頂禮」0、「宗喀巴」0。
- seg-0001 「老師好 各位同學大家好」 — opening greeting from a student
  presenter (not the teacher); likely the same 張儒 / 收攝 student presenter
  pattern as prototype-04 (recurring 「收攝」 student, 「法師好」 addressed
  to the teacher).
- Title says 「略述集量論的禮讚文（上）」 — the segment count and
  duration match the 「上」 half (next playlist item 6 is 「下」).

## Limitations (hard)

1. **No question / teacher summary candidates.** `questionIndex` is empty
   and `teacherSummaries` is empty in `candidate.json`. This is by design:
   the task spec for prototype-05 is explicit that
   *"leave questionIndex and teacherSummaries empty with one explicit BLOCKED
   exclusion: speaker role is not proven."*
2. **Speaker roles are not proven.** Without diarization or a human listener
   who can distinguish teacher / 提問同學 / 收攝同學 / 其他同學 in audio,
   attributing any segment to the teacher (as opposed to a student
   paraphrasing, agreeing, or extending) is not possible from this transcript
   alone. This is the hard blocker that keeps the prototype BLOCKED.
3. **No independent human review.** A Buddhist-domain reviewer must audit
   the ASR, validate any future question/summary pairs, and confirm the
   closing liturgy was transcribed correctly against audio before
   publication.
4. **Model downgrade.** `large-v3-turbo` OOM'd alongside the resident vLLM;
   `medium` int8 was used. Quality is below the reference target (same as
   prototype-01/02/03/04).
5. **VAD disabled.** Silero VAD hung in PyTorch on sm_121 (same as
   prototype-01/02/03/04).
6. **Closing dedication chant not transcribed.** The HHDL Tibetan / Sanskrit
   dedication after 「大家請合掌」 is out-of-distribution for the medium
   zh-only faster-whisper model. ~15 s of audio at the end is silent in the
   transcript. Audio-only verification needed for liturgical completeness.

## Cleanup (verified)

Cleanup actions taken by the ASR driver, verified after this review run:

- `/tmp/proto05_audio/` — **absent on disk** at this review run
  (directory and `source.mp4` were removed at ASR completion per
  `run_manifest.cleanup.removedPaths`).
- `/tmp/proto05_audio/source.mp4` — **absent on disk** (audio was hashed
  once, transcribed once, then deleted; never re-downloaded).
- `/tmp/proto05_driver.py` — driver script created by this run; **left in
  /tmp** for evidence (not part of the prototype pipeline, not executed
  again after the initial run).
- `/tmp/proto05_run.log` — driver stdout/stderr log; **left in /tmp** for
  evidence.
- `/tmp/proto05_check.py`, `/tmp/proto05_risks.py` — helper scripts created
  by this review run for invariant verification; **removed** at review end.

Re-verification after cleanup:

```
absent: /tmp/proto05_audio
absent: /tmp/proto05_audio/source.mp4
```

No tests, inventory, course files, or other sessions / prototypes were
modified by this review. Only files inside
`reviews/evidence/study-group-2025/prototype-05/` were written (this
`review.md`), and only disposable `/tmp/proto05_audio/` artifacts listed
above were removed by the ASR driver.

## Artifact paths

- `reviews/evidence/study-group-2025/prototype-05/raw_asr.json`
- `reviews/evidence/study-group-2025/prototype-05/candidate.json`
- `reviews/evidence/study-group-2025/prototype-05/run_manifest.json`
- `reviews/evidence/study-group-2025/prototype-05/review.md`

## Recommended next actions

1. **Add speaker-role evidence** (diarization with overlap-aware model, or a
   human listener who can tag teacher vs. student turns) before any
   question-extraction work on this transcript.
2. **Human audit of the closing liturgy** (seg-3411 … seg-3412 + ~15 s
   trailing silence) against audio; this transcript's opening liturgy
   (「南無本師釋迦牟尼佛」×3) is captured cleanly, but only audio
   confirmation can settle the closing dedication.
3. **Upgrade this review to PASS only after items 1–2 are signed off** and
   `questionIndex` / `teacherSummaries` are populated and validated.
