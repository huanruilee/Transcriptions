# Supplemental independent review: full-book TOC preservation

**Result: PASS.** Reviewed fixed commit `bf08940dd609297834631bb3d3408b439f52835c` in `/private/tmp/transcriptions-38a-independent`, fetched from `/private/tmp/transcriptions-38a-upgrade`; diffed against `01bf9bc341897903fd8d77e723e0e2179bcf64d5`. Delivery checkout was not modified.

The update correctly preserves two TOC sources in the accordion. `App.vue` continues passing `currentTocTree` as the local/course tree and now separately passes `courseStore.tocTree || []` as `bookTocNodes`. `TOCAccordion.vue` renders its current-scope nodes for course scope and the global book tree for book scope, with backward-compatible fallback to `tocNodes` when the optional prop is absent. This fixes the regression where a valid session projection replaced the full-book contents in both scopes.

The added component test mounts the accordion with distinct local and full-book nodes, verifies the local node initially, switches to “全書總科判,” then verifies the book-only node. It passed with the projection test.

Command: `npm run test:v2 -- --run tests/unit_v2/sessionTocProjection.test.ts` — **PASS**, 1 file / 2 tests.

No blockers found in the three code/test changes. The two other changed files in the commit are added review/browser evidence; no transcript/session data changed. This is a focused component test, not a live deployed-browser check.
