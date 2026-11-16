# Independent review: 38A faithful reading delivery

**Result: PASS, with one repository-wide test limitation and no delivery-blocking findings.**

Reviewed fixed commit `01bf9bc341897903fd8d77e723e0e2179bcf64d5` against base `01d5171d4017593b556af2f1d5df2a762020f66f` in independent clone `/private/tmp/transcriptions-38a-independent`. The delivery checkout was not modified.

## Scope findings

- **Sentence coverage and source metadata: PASS.** A direct comparison of the immutable `reviews/evidence/session38a-faithful/source-session.json` with published `courses/入中論善顯密意疏/sessions/session_38A.json` found 329 paragraphs and all 657 sentences in both. Sentence order, timing, IDs, and other non-text fields matched exactly (excluding the intentional review annotations/rawText and text edits). The reviewed plan has 241 unique pending locators; all 241 published sentences are marked `reviewNeeded`. The generator clones the source, validates edits against source-text spans, and keeps original text in `rawText` (`scripts/session38a_faithful_reading.mjs:109-165`).
- **Source-faithful changes and provenance: PASS.** Edits are locator-bound with source digest, before/after text, occurrence count, basis, and source spans; overlapping or count-mismatched edits fail closed (`scripts/session38a_faithful_reading.mjs:62-88`). The publication and all three reader formats display provisional/unreviewed status; the HTML retains candidate and original text, pending reasons, official-audio links, and an explicit bounded excerpt disclosure. `humanListened` remains false in the evidence and excerpt manifest.
- **Overview/provenance binding: PASS.** The publisher validates the overview against the generated session and requires `ai-reviewed` before writing (`scripts/publish_session38a_reading.mjs:11-13`). The current published overview and evidence binding are present. The normal workflow permits provisional publication, and the reader-visible notice is present in generated HTML/Markdown/TXT.
- **Bounded audio excerpt: PASS.** Manifest binds the official source URL/hash and excerpt SHA-256, defines 4460–4491.7028125 seconds (31.7028125 source seconds), and marks `humanListened:false`. The clip is 254,257 bytes; the focused publication test confirmed full decoding. The review page describes it as only the final excerpt and links its manifest.
- **Session-only TOC: PASS.** The projection has five 38A-scoped nodes, source digest binding, page/source locators, and explicit `needsReview` markers. The composable rejects mismatched session/digest and invalid nodes (`src/composables/sessionTocProjection.ts:3-8`); `App.vue` resets the projection when loading a session and uses it for the desktop/mobile TOC (`src/App.vue:938-945,1713,1789`). Diff scope contains no `toc.json` or 36/37/38B content changes.

## Validation

- `node --test tests/unit/session38aFaithfulReading.test.js tests/unit/session38aPublication.test.js` — **PASS**, 13/13.
- `npm run test:v2 -- --run tests/unit_v2/session38aPublication.test.ts tests/unit_v2/sessionTocProjection.test.ts` — **PASS**, 2/2.
- `node scripts/audit_session38a_audio.mjs` — **PASS**, 657 sentence records, 2,608 ASR segments, one preserved anomaly. This command regenerated `audio-advisory.json` only in the independent clone; no change was made to the delivery checkout.
- `npm test` — **one unrelated environment failure**: `tests/unit/syncServer.test.js` could not start its local server on port 19091. The other tests passed; this does not implicate the 38A changes.
- The initial attempt to invoke `.ts` tests directly with `node --test` failed because Node does not resolve Vite TypeScript extensionless imports; rerunning through the repository's Vitest command passed.

## Limits

This is a code/data and focused-test review, not a live deployed-browser or content/audio acceptance. The workflow and artifacts correctly leave human listening and user reading approval pending. The TOC anchors are visibly marked for later review.
