# Reviewer Failure Log

## Attempt 1: agent30b-reviewer2-20260903

- Verdict: `BLOCKED`
- Cause: profile disallowed its proposed analysis command.
- Evidence inspected: none.
- Acceptance value: none.

## Attempt 2: xiaojian

- Verdict: `FAIL` (reviewer output itself is invalid)
- Claimed: 20 confirmed decisions and a duplicate `sent-165`.
- Actual ledger: 38 unique decisions, 6 `CONFIRMED`, 32 `UNCERTAIN`.
- Tool evidence: no file or terminal reads were present in the run record.
- Acceptance value: none; claims contradicted deterministic validation.

Reviewer prose is not evidence. Future review must pass the ledger schema/count
validator and cite actual inspected IDs before its semantic verdict is used.
