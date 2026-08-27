# TOC Review & Acceptance Package

Generated: 2026-08-27

Acceptance status: WEB_REVIEW_OK_CONTENT_ACCEPTANCE_OPEN

Henry web review OK recorded on 2026-08-27. Domain/content review flags remain open.

## Purpose

This package summarizes the TOC remediation work for `courses/入中論善顯密意疏/toc.json`.
It separates engineering verification from doctrinal/content acceptance.

## GitHub Trail

- Umbrella issue: #13
- M1 draft PR: #14
- M2 draft PR: #19
- M3 draft PR: #22
- M4 draft PR: #23

The stacked PRs have Henry web review OK. They are not an accepted repository baseline until merged.

## Automated Gate Summary

- Published sessions: 198
- Precise positive TOC anchor sessions: 82
- Broad sessionIds spans needing review: 15
- Pending timestamp nodes: 180
- Coverage needs-review sessions: 116
- Invalid TOC targets: 0
- Published sessions without explicit TOC coverage status: 0

Verified commands:

```bash
node --test tests/unit/tocRemediation.test.js
node --test tests/unit/tocRemediation.test.js tests/unit/toc.test.js tests/unit/a11y.test.js tests/acceptance/completion.test.js
node scripts/audit_toc.js
```

These commands verify renderer behavior, data-contract hygiene, accessibility-related TOC behavior,
completion acceptance constraints, and explicit TOC coverage accounting.

## Human Review Result

Henry reviewed the web result and recorded review OK on 2026-08-27.

The following domain/content review flags remain open:

- Whether the 15 broad `sessionIds` spans should be split, retained as inferred, or corrected.
- Whether the 180 `timestamp: 0` nodes should remain pending or receive precise playback offsets.
- Whether the 116 sessions in `toc.coverage.needsReview` are acceptable as missing precise anchors.
- Whether the 79-110 chapter mapping concerns recorded in `docs/QA_REPORT_79_102.md` require TOC title or scope changes.
- Whether `sessionAnchors` generated from primary `sessionId` nodes match the intended course navigation experience.

## Remaining Acceptance Checklist

- Henry or a domain reviewer samples the flagged 79-110 area against actual transcript/audio content.
- Henry decides whether the remaining content flags can be accepted as-is or need correction.
- Any accepted content corrections are captured in a separate commit or PR with reviewer notes.
- Final repository baseline still requires merging the stacked PRs.

## Residual Non-TOC Test Signal

`node --test tests/unit/sidebarFilterBehavior.test.js` currently fails in an out-of-scope Issue #9 sidebar filter case:
query `甲二 造論宗旨` is expected to locate `02A`, but returns 0 matches.

This failure is not treated as TOC remediation acceptance evidence. It should be handled in the sidebar/search workstream.
