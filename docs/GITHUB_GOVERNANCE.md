# GitHub Governance

GitHub is the system of record for repository work. Every non-trivial change
uses this lifecycle:

1. Issue with milestone, owner, scope, exclusions, and acceptance criteria.
2. Agent-specific branch and commit author email.
3. Intentional failing contract test before production changes.
4. Pull request linked to the issue, with reproducible evidence.
5. Independent review of the exact commit from a separate workspace.
6. Required GitHub Actions checks before merge.
7. Pages deployment only from the accepted `main` commit.

## Main Branch Policy

The GitHub branch protection settings for `main` must require pull requests,
require the `Unit and acceptance tests` status check, require branches to be up
to date, resolve review conversations, and prohibit force pushes and deletion.

All current agents authenticate through one GitHub account. Their branch names
and commit emails provide attribution, but do not constitute independent GitHub
identities. Until a second account or trusted GitHub App is available,
independent-review evidence must name the reviewer, reviewed commit SHA, verdict,
commands, and evidence in the pull request. Do not enable a required approval
count that the sole account cannot satisfy.

## Deployment Policy

`Completion Acceptance` runs for pull requests and pushes to `main`. `Deploy to
GitHub Pages` listens for completion of that workflow and deploys only when a
`main` push succeeds. It checks out `workflow_run.head_sha`, ensuring that the
deployed artifact is built from the commit that passed acceptance.

## States

- `candidate`: available for review, not accepted as published content.
- `blocked`: missing required evidence or a failed gate.
- `accepted`: automated and independent review gates passed.
- `deployed`: the accepted commit is verified on the public Pages URL.

These states are cumulative. A deployment does not retroactively turn candidate
content into accepted content.
