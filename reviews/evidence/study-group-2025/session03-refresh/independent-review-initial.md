# Independent fixed-version review

Reviewed commit: 7689442 (production content d66ccdafa3c2f2d9105fbdd04355bda5fe3248f3).
Separate detached checkout: /private/tmp/transcriptions-s03-review.
Verdict: DO NOT MERGE until substantive clause deletions are repaired.

## Findings

- P1, session_03 seg-3072 (source IDs 3072–3086): consolidated rawText retains the teacher’s argument, but the displayed text drops the key chain “put a correct thesis in mind without thinking about its reason -> cognition easily becomes doubt” and “do we really agree?”. This is not filler removal. Restore from immutable baseline, preserving verified 僅宗將轉猶豫知.
- P1, session_03 seg-1440 (source IDs1440+1441): the correction to 了義經/不了義經 overwrites the merged following sentence “這個也沒有辦法。” Restore that negative qualification and ensure terminology has actual audio evidence.

## Reproducible checks

- node --test tests/unit/studyGroupSession03Refresh.test.js tests/unit/contentOverviewPipeline.test.js tests/unit/studyGroupStructural.test.js: 40 pass, 0 fail (logs /private/tmp/session03-independent-node.log).
- npx vitest run tests/unit_v2/tocAccordion.test.ts: 5 pass (log /private/tmp/session03-independent-vitest.log).
- Independently compared all final sentence source IDs/raw/times against immutable baseline; dedicated contract passes full4086 source coverage. Checked all source manifest hashes:4/4 correct.
- Scanned every sentence for >40% Chinese-character reduction and for protected negative tokens dropped vs baseline. All other large reductions inspected were disfluency consolidation. Only1440/3072 lost any protected negative token.
- Three official question chapters425/5586/7131, teacher handoffs2235.52/6304.56/7764.92,12headings and final Q3 qualification are represented. Guide retains the crucial limitation: option4 rebuts option3 but does not directly prove liberation from an unestablished liberated person.
- Candidate publication state and four reviewNeeded items remain explicit. No human listening approval claimed. Production change does not touch protected01/四念住08.
- Validator source-bound Codex provenance adds no unconditional provider bypass: valid baseline digest binding, final digest and unique complete supported review entries required. TOC fallback safely handles missing/nonstring titles while retaining seek behavior.

Limits: AI source review and local Re-ASR evidence, not human sentence-by-sentence listening. Existing raw source is evidence preservation, not a substitute for displayed-text completeness; the two findings demonstrate why tests alone do not prove content acceptance.
