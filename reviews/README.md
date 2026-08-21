# Human-ear review — Issue #11 v2

## How to review

1. Open `reviews/index.html` in a browser **on the local network** so the
   audio clips (`qa_27B/_human_review_clips/...`) are reachable via the
   existing Tailscale funnel at `https://gx10-2887.tail378c21.ts.net/transcriptions/...`.
   Or serve locally with `python -m http.server 8000 -d reviews`.

2. Each row has:
   - a 16-kHz mono WAV clip of the audio segment
   - the current sentence text (published / 校正後)
   - the previous / next sentence text
   - reasons (one or more: START, END, CHUNK_BOUNDARY, NEEDS_REVIEW,
     STRICT_INCONCLUSIVE, STRICT_ANCHOR_FAIL, SUBSTITUTE_UNANCHORED)

3. Pick **exactly one** verdict from the dropdown. Options are:
   - `ANCHOR_PASS`
   - `SHIFTED_PREVIOUS`
   - `SHIFTED_NEXT`
   - `BOUNDARY_TOO_EARLY`
   - `BOUNDARY_TOO_LATE`
   - `NO_SPEECH`
   - `INCONCLUSIVE`

4. Add an optional note (free text). Click elsewhere to auto-save.

5. When finished, click **Export JSON** to download your verdicts. Save
   the file as `reviews/human_review_verdicts.json` and commit it. **Do
   NOT commit raw audio** — clips stay on disk under
   `qa_27B/_human_review_clips/`.

## What the verdicts mean

- **ANCHOR_PASS** — the audio segment clearly contains the published sentence text.
- **SHIFTED_PREVIOUS** — the audio segment actually belongs to the PREVIOUS sentence (timestamp is too late).
- **SHIFTED_NEXT** — the audio segment actually belongs to the NEXT sentence (timestamp is too early).
- **BOUNDARY_TOO_EARLY** — `[start, end]` cuts off the spoken sentence at its beginning.
- **BOUNDARY_TOO_LATE** — `[start, end]` includes audio that belongs to the next sentence.
- **NO_SPEECH** — the segment is silent / intro / music / sub-volunteer ID; not a sentence anchor failure.
- **INCONCLUSIVE** — couldn't decide (e.g., unclear recording).

## Acceptance criteria (next-step)

- All `NEEDS_REVIEW` sentences must have a verdict.
- All `START` / `END` samples must have a verdict.
- All `STRICT_INCONCLUSIVE` rows must have a verdict.
- A `SHIFTED_PREVIOUS` or `SHIFTED_NEXT` verdict on any `CHUNK_BOUNDARY`
  sample is an automatic `AUDIO_ALIGNMENT_FAILED` (path E-A).
