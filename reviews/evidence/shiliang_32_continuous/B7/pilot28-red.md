# Session 28 Pilot RED Evidence

- Baseline: `c83e9f0`
- Command: `node --test tests/unit/session28AnchorRegression.test.js`
- Expected failure: whole-stream timestamp monotonicity
- Observed boundary: `sent-194.end=2359.15`, `sent-195.start=2258.83`
- Delta: `-100.32` seconds
- Status: `RED_CONFIRMED`

The previous regression test skipped this boundary as a known discontinuity.
The generalized quality contract does not permit that exception: published
sentence timestamps must remain monotonic across the complete session.
