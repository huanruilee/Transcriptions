# Transcript proofreading evidence

This directory stores proofreading candidates and review evidence. Only a source-bound independent PASS and promotion record authorize a published transcript change.

## Current acceptance state

- Inventory: 302 sessions across four courses.
- Fixed stratified pilot: 12 sessions (first, middle, last per course).
- Complete pilot evidence: 12/12 fixed stratified sessions.
- Content acceptance: 四念住/session_08 passed independent review in immutable run e153a10f-c521-44b3-b300-82cd349bb207 and was promoted. Its later overview amendment preserves the approved body. The original pilot FAIL remains historical evidence; the other 11 pilot sessions still require content acceptance.
- Full-corpus run: not started; it remains gated on 12/12 pilot review.

For candidate generation to count as complete, its ledger, review queue, and model responses must share the `runId` and match every digest in `session_<id>.complete.json`. Generation does not approve publication. Only 四念住/session_08 is included in this release; other official sessions remain unchanged.

## Verified commands

```sh
npm run test:proofread:pipeline
npm run test:proofread
npm run proofread:inventory
npm run proofread:pilot:local -- --course '釋量論第二品' --session 32 --batch-size 50
npm run proofread:reviewer:eval -- --provider=qwen
```

The reviewer evaluation also supports `--provider=minimax` and `--provider=eneural` when their credentials/endpoints are available. Passing the 14-case fixture is only a routing regression test; it does not approve transcript content.

The full-corpus entrypoint is deliberately separate:

```sh
npm run proofread:pilot:local -- --all --batch-size 50
```
