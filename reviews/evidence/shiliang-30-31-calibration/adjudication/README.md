# Sentence review evidence — candidate only

This directory is Draft research evidence, not a production timing overlay. It does not change source text, reading approval, published dates, or reader timestamps. `publicationAccepted:false` and `humanListened:false` remain mandatory.

| Session | Sentences | Machine boundary evidence ready | Needs listening |
| --- | ---: | ---: | ---: |
| 30 | 546 | 450 | 96 |
| 31 | 545 | 471 | 74 |

Two decoding passes use the same faster-whisper turbo model. Agreement is not independent model corroboration or human listening acceptance. Second-pass whole-candidate results got worse (30:105→108 issues; 31:67→73); the original fail-closed publication gate remains unchanged.

`session_*.alternatives.json` preserves first, second, and bounded local alignment alternatives, including rejected alternatives. Acoustic paths refer to immutable files in this Draft branch. Second-pass evidence records hashes of both first-pass words and raw retry output. No raw audio is committed.

`session_*.adjudication.json` preserves source ID/text/display order and every alternative. Existing valid first-pass evidence is preferred. Cross-pass disagreement, unmatched wording, ambiguous short replies, and overlapping sentence bounds remain pending. Pending final boundaries are null; proposed bounds are only search aids.

Reproduce the recorded decision ledger from the repository root:

```sh
node scripts/adjudicate_calibration_alternatives.mjs reviews/evidence/shiliang-30-31-calibration/adjudication/session_30.alternatives.json courses/釋量論第二品/sessions/session_30.json reviews/evidence/shiliang-30-31-calibration/audio-identity.json /tmp/session_30.adjudication.json
node --test tests/unit/audioCalibrationAdjudication.test.js tests/unit/audioCalibrationRecordedRegression.test.js tests/unit/audioCalibrationLocal.test.js tests/unit/audioCalibrationServer.test.js
```

For a new bounded-local search, `build_local_calibration_alternatives.py` requires OpenCC and the original local work files; `--evidence-root reviews/evidence/shiliang-30-31-calibration` emits portable tracked evidence references.

Reading/audio chronology example: lecture 30 `sent-101` is 953.26–960.41 seconds, while following displayed `sent-102` is 948.16–952.70. These are machine proposals. The player chronology fix is separate PR302, with synthetic store regression coverage. It preserves display order and does not apply these candidate times.

## Local listening package

`build_calibration_review_package.py` requires the exact hash-matched local source audio and adjudication ledgers. It writes a local-only package, including full audio, outside Git. Serve it with `serve_calibration_review.py` (loopback only; supports byte ranges needed for MP3 seeking). `test_calibration_review_package.mjs` checks real audio seeking and source-bound export with a synthetic reviewer. That test is engineering evidence only and does not authorize listening acceptance.

Exports carry package/source/audio/ledger digests, reviewer, decisions, and `clock:source-audio`. For eventual video timestamps, separately apply the verified `videoOffsetSeconds` from the audio identity. Never add that offset while reviewing source audio. Exporting does not modify the site. Each confirmed record requires explicit listening and valid bounds; resolving 170 pending records and checking the remaining machine proposals are still unfinished listening work.

## Authorized partial release — 2026-10-25

Henry authorized publication after setting a 0.5-second tolerance. The published overlay accepts only valid machine-ready candidates whose video start AND end differ from the original site by at most 0.5 seconds (30:5; 31:9). This limits change size; it does not establish absolute acoustic accuracy. It does not claim two independent passes: derived second-pass words outside rescue windows are copied first-pass data. Source files and reading approval remain unchanged; the separate partial overlay is SHA-bound in course metadata and the reader/download show partial calibration and no human listening. All other times remain original. Rollback: remove the two course overlay opt-ins (or revert the publication commit); failure to fetch/validate already falls back visibly to original times.
