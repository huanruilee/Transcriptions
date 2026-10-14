# Transcript proofreading evidence

This directory stores candidate-only proofreading evidence. Nothing here authorizes edits to `courses/`.

## Current acceptance state

- Inventory: 302 sessions across four courses.
- Fixed stratified pilot: 12 sessions (first, middle, last per course).
- Complete v4 pilot evidence: `釋量論第二品/session_32`.
- Remaining pilot sessions: 11.
- Full-corpus run: not started; it remains gated on 12/12 pilot review.

For a session to count as complete, its ledger, review queue, and model responses must share the `runId` and match every digest in `session_<id>.complete.json`. Model proposals remain `pending` and `reviewRequired`; official session JSON is unchanged.

## Verified commands

```sh
npm run test:proofread:pipeline
npm run test:proofread
npm run proofread:inventory
npm run proofread:pilot:local -- --course '釋量論第二品' --session 32 --batch-size 50
```

The full-corpus entrypoint is deliberately separate:

```sh
npm run proofread:pilot:local -- --all --batch-size 50
```
