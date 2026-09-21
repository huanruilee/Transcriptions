# Prototype-04 Review — Blocked (rev 1)

Status: **BLOCKED**

This prototype is an ASR-only artifact. No question attribution, no teacher
summary, and no human reviewer sign-off exist. It must not be treated as
publication-ready. The deliverable is a verified transcript of `__8WjGF3hhw`
that downstream question-extraction work (with audio + speaker-role evidence
or human review) can build on.

## Source

- playlistIndex: 4
- videoId: `__8WjGF3hhw`
- title: 第2講 如何探究真相（下）｜2025《釋量論・第二品》大組共學
- sourceUrl: https://www.youtube.com/watch?v=__8WjGF3hhw
- playlistUrl: https://www.youtube.com/playlist?list=PLlVfdhU37xZCXzlW90v10Y6z8w3Oue0Uh
- identity provenance: matched against `reviews/evidence/study-group-2025/playlist_inventory.json`
  item 4 (videoId, rawTitle, sourceUrl, playlistIndex all consistent)

## ASR

- engine: faster-whisper
- model: medium
- compute_type: int8
- device: cuda (GB10, sm_121)
- language: zh
- elapsed_seconds: 482.046
- rtf: 0.04857
- word_timestamps: true
- vad_filter: false
- beam_size: 5

## Counts

- audioDurationSeconds: 9925.58 (ffprobe 9925.578594, candidate 9925.578594)
- declared duration (yt-dlp probe): 9926.0 s
- **segments: 3466** (id-stable, `seg-0001` … `seg-3466`)
- **word tokens: 26645** (faster-whisper `word_timestamps` tokenization, per
  `run_manifest.json` `commands[4].note` and `checks.totalWordTokens`).
- audio coverage: 99.9982 % (last segment ends at 9925.4 s vs. audio 9925.58 s;
  trailing ~0.18 s is final silence / breath, no transcribed segments)

## Audio

- audioSha256: `73f4a7a3d67f2c7ef408ef4fc6dc79ea1df250e974dac8a8ea078149380a6563`
- bytes: 292926807
- container: mp4 (yt-dlp format 18, h264 + aac)
- downloaded once: yes (single yt-dlp format 18 call; no re-download)
- **temporaryAudioDeleted: true** (`/tmp/proto04_audio/source.mp4` removed
  after ASR; the entire `/tmp/proto04_audio/` directory was removed with it)

## Deterministic checks (all pass)

Programmatic re-verification against `raw_asr.json` + `candidate.json`
+ `run_manifest.json` on this run:

- videoId matches across all three artifacts (`__8WjGF3hhw`)
- audioSha256 matches across raw_asr, candidate provenance, manifest command notes
- source URL matches `https://www.youtube.com/watch?v=__8WjGF3hhw`
- playlistIndex 4 matches `playlist_inventory.json` item 4
- rawTitle matches inventory: 第2講 如何探究真相（下）｜2025《釋量論・第二品》大組共學
- JSON parses for all three artifacts
- segments: 3466 (matches manifest)
- word tokens: 26645 per `checks.totalWordTokens` (matches manifest)
- **monotonic timestamps: 0 violations** across all 3466 segments
- **unique segment ids: 3466/3466** (no dup)
- **empty-text segments: 0**
- audio coverage: 99.9982 %
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
  (`reviews/evidence/study-group-2025/prototype-04/...`), not `/home/henry/...`

## Unresolved ASR risks

Observed in the source ASR and not corrected. Per spec, words are never
substituted without repository evidence; these are flagged for human review
of the raw ASR, not for `candidate.json` edits.

- This transcript is markedly cleaner than prototypes 02 and 03:
  - 「**迴向**」 is correctly transcribed at seg-3461
    「我們一起來做**迴向**」 (no 「回項」 misfire that bit p02 seg-3593
    and p03 seg-4532).
  - The opening liturgy 「南無本師釋迦牟尼佛」 is not in this
    second-half session (the second-half session skips directly to 共學
    without a 禮敬法師 / 南無 opening, unlike p02/p03).
  - 掃描風險詞：「回項」0、「南盟」0、「涅盤」0、「班智達」0。
- Spot-check on closing dedication (seg-3461 … seg-3466): full liturgy
  captured correctly:
  - 「我們一起來做迴向」
  - 「請大家合掌」
  - 「御池無上大師教」 (བླ་མའི་བཀའ་དཔེ་མཆོག་ཏུ་གྱུར་ཅིག་བདག་ཅག་གིས་མཐོང་བརྗོད་དང་། །ཐུབ་དབང་འཇིགས་རྡུ་ལས་སུ་སྒྲོལ་ནས་ཀྱང་། །ཐུགས་རྗེ་ཅན་གྱི་མིང་ལ་ཕྱག་འཚལ་ལོ། །)
    rendered as the four-line HHDL dedication, closing with
    「願成善事攝受因」 (seg-3466, end=9925.4 s).
- seg-0002 「我們就先請**張儒**為我們做第二講下半部的**收攝**」 —
  this is the student presenter introducing themselves / being introduced;
  the name 「張儒」 (likely 張儒林) and 「收攝」 (a summary task) appear
  here and recur. Both renderings are intelligible and need human
  verification only if names are critical downstream.

## Limitations (hard)

1. **No question / teacher summary candidates.** `questionIndex` is empty
   and `teacherSummaries` is empty in `candidate.json`. This is by design:
   the task spec for prototype-04 is explicit that
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
   prototype-01/02/03).
5. **VAD disabled.** Silero VAD hung in PyTorch on sm_121 (same as
   prototype-01/02/03).

## Cleanup (verified)

Cleanup actions taken by the ASR driver, verified after this review run:

- `/tmp/proto04_audio/` — **absent on disk** at this review run
  (directory and `source.mp4` were removed at ASR completion per
  `run_manifest.cleanup.removedPaths`).
- `/tmp/proto04_audio/source.mp4` — **absent on disk** (audio was hashed
  once, transcribed once, then deleted; never re-downloaded).
- `/tmp/proto04_driver.py` — driver script created by this run; **left in
  /tmp** for evidence (not part of the prototype pipeline, not executed
  again after the initial run).
- `/tmp/proto04_run.log` — driver stdout/stderr log; **left in /tmp** for
  evidence.
- Helper scripts `/tmp/p4_compile.py`, `/tmp/p4_smoke.py`,
  `/tmp/p4_check.py`, `/tmp/p4_head_tail.py`, `/tmp/p4_risks.py`,
  `/tmp/p4_qg.py`, `/tmp/p4_inspect.py`, `/tmp/p4_inspect_raw.py`,
  `/tmp/p4_envcheck.py` — created by this review run for invariant
  verification; **removed** at review end.

Re-verification after cleanup:

```
absent: /tmp/proto04_audio
absent: /tmp/proto04_audio/source.mp4
```

No tests, inventory, course files, or other sessions / prototypes were
modified by this review. Only files inside
`reviews/evidence/study-group-2025/prototype-04/` were written (this
`review.md`), and only disposable `/tmp/proto04_audio/` artifacts listed
above were removed by the ASR driver.

## Artifact paths

- `reviews/evidence/study-group-2025/prototype-04/raw_asr.json`
- `reviews/evidence/study-group-2025/prototype-04/candidate.json`
- `reviews/evidence/study-group-2025/prototype-04/run_manifest.json`
- `reviews/evidence/study-group-2025/prototype-04/review.md`

## Recommended next actions

1. **Add speaker-role evidence** (diarization with overlap-aware model, or a
   human listener who can tag teacher vs. student turns) before any
   question-extraction work on this transcript.
2. **Human audit of the closing liturgy** (seg-3461 … seg-3466) against
   audio; this transcript is the cleanest of the three so far, but only
   audio confirmation can settle it.
3. **Upgrade this review to PASS only after items 1–2 are signed off** and
   `questionIndex` / `teacherSummaries` are populated and validated.
