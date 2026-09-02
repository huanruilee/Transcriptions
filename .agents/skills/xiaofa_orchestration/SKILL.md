---
name: xiaofa-orchestration
description: Evidence-first operating procedure for directing Xiaofa on transcription and web-content work, with staged gates, independent review, and production acceptance.
---

# Xiaofa Orchestration

Use this skill when the orchestrator delegates work to Xiaofa and must obtain a
correct, reviewable, production-ready result. The orchestrator owns the scope,
gates, evidence, and final acceptance. Xiaofa owns implementation inside the
assigned boundary. A separate reviewer challenges the result.

This skill is specific to the Transcriptions repository, Buddhist course
content, audio/ASR artifacts, and the web table of contents. It complements
`agent-orchestration`; it does not replace it.

## Core principle

Command the work as a sequence of proof-producing milestones, not as one large
request to "finish the page". Every milestone must produce an artifact that a
new agent can inspect without trusting a chat summary.

The accepted chain is:

`SPECIFIED -> RED -> IMPLEMENTED -> GREEN -> REVIEWED -> INTEGRATED -> DEPLOYED -> ACCEPTED`

If a gate is uncertain, remain at the earlier gate. A live task, heartbeat,
HTTP 200, healthy container, or plausible screenshot is not acceptance.

## Roles

### Orchestrator

- Defines the contract and the allowed file boundary.
- Creates or confirms the RED test before production edits.
- Dispatches Xiaofa with an exact workspace and persistent evidence directory.
- Independently inspects the evidence and diff.
- Dispatches a separate read-only reviewer.
- Decides whether the milestone may advance.
- Reports blocked causes and residual risks without smoothing them over.

### Xiaofa

- Performs the assigned implementation or investigation only.
- Starts by proving workspace, branch, and baseline status.
- Saves commands, exit codes, raw outputs, hashes, and changed-file lists.
- Does not invent transcript text, create empty session placeholders, merge,
  deploy, restart services, or mutate hardware unless the task explicitly
  authorizes that action.

### Independent reviewer

- Uses a new task context and separate workspace or a read-only evidence copy.
- Reads the actual artifacts and diff, not only the worker's report.
- Re-runs the relevant checks where possible.
- Returns `PASS`, `FAIL`, or `BLOCKED`, with evidence paths and severity.
- Cannot approve work that it did not independently inspect.

## Milestone method

### M0: Specify the contract

Write a short task brief before dispatch:

```text
Scope: one bug or one bounded feature; list allowed paths.
Baseline: branch, commit, workspace root, and known unrelated changes.
RED: exact command and the expected failure.
GREEN: exact invariants and commands that must pass.
Source: authoritative URL/files and identity rules.
Evidence: persistent directory and required raw artifacts.
Forbidden: placeholders, invented data, merge, deploy, restart, hardware mutation.
Closeout: branch/commit, test output, diff, reviewer handoff, residual risk.
```

Do not let a worker infer a broad goal from a short sentence. A task should be
small enough that its failure has one primary cause.

### M1: Establish the workspace

The worker's first commands should be equivalent to:

```sh
pwd
git rev-parse --show-toplevel
git status --short --branch
git log -1 --oneline
```

Never use a shared dirty checkout for delegated implementation. A Kanban
workspace is not automatically a Git checkout. If it lacks `.git`, clone the
repository into a child directory and verify the root before editing.

Record the workspace path, branch, commit, and status in the evidence bundle.

### M2: Write and run the RED test

The test must fail on the baseline for the intended reason. For a TOC/session
change, test the contract across all relevant artifacts, not just one file:

- official session inventory contains the expected session;
- `course.json`, session JSON, `audio_map`, and sidebar agree;
- published session has non-empty text and timestamped monotonic segments;
- source URL, duration, hash, and engine metadata are present;
- pending/unavailable status is not mixed with a published session.

Save the command and complete failing output. If the test passes before the
fix, stop and explain why the baseline is not the expected baseline.

### M3: Implement the smallest fix

Give Xiaofa only the allowed paths and the invariants. Require a focused diff.
For ASR bugs, materialize one-shot generators before consuming them more than
once. For content work, preserve the raw ASR, source-grounded correction, and
published representation as separate traceable layers.

Do not allow a UI marker to conceal missing content. A pending marker is a
valid interim state; an empty or invented session is not.

### M4: Prove GREEN

Require all of the following before review:

- targeted RED test now passes;
- relevant unit/integration tests pass;
- JSON/schema and cross-artifact consistency checks pass;
- changed-file list and diff inspection show no scope leakage;
- evidence files are readable from the persistent directory;
- source and runtime claims have raw outputs, not prose only.

For audio/ASR, require content evidence with:

- authoritative source URL or path;
- HTTP status and content type;
- duration and byte count;
- SHA-256 hash;
- model/runtime identity;
- non-empty text;
- numeric `start`, `end`, and `text` on every segment;
- monotonic timestamps within the source duration.

Health checks, CUDA availability, image digests, and successful HTTP requests
are necessary operational evidence but do not prove transcript correctness.

### M5: Run independent review

Dispatch a different agent after GREEN. The reviewer must receive the commit,
the persistent evidence path, the acceptance criteria, and a read-only posture.
Use a bounded timeout. If the worker only emits heartbeats or remains `running`
without useful artifacts, classify it as a capability/evidence failure, stop or
retry it, and do not convert its summary into approval.

The reviewer must explicitly check:

1. the RED test was meaningful;
2. the fix addresses the demonstrated cause;
3. source, raw ASR, corrected text, and published text remain traceable;
4. TOC/sidebar links to the real artifact;
5. test output and hashes match the claimed commit/runtime;
6. no pending marker, empty placeholder, or unrelated change slipped through.

### M6: Integrate and deploy

Integration requires an intentional commit and PR. Use the configured agent
identity, for example:

```sh
git config user.name "Codex Agent"
git config user.email "huanruilee.us+codex@gmail.com"
```

Never stage unrelated user changes. Before deployment, record the exact commit
and image/container or site artifact identity. If deployment is authorized,
save the old identity and a rollback command before changing the runtime.

After deployment, verify the intended behavior through the deployed endpoint or
browser artifact. Do not stop at process health.

### M7: Accept or hold

Accept only when implementation, tests, independent review, source evidence,
and deployed behavior agree. Otherwise report `PENDING` or `BLOCKED` and name
the missing proof.

For a new transcript/session, the final closeout requires:

1. official inventory and audio identity;
2. stable audio metadata and hash;
3. non-empty timestamped raw ASR;
4. source-grounded proofreading evidence;
5. independent review of representative alignment;
6. targeted and full regression results;
7. real TOC/sidebar publication state;
8. deployed runtime/browser evidence.

## What failed in practice

### Ineffective patterns

- Asking Xiaofa to "fix everything" without a file boundary or acceptance test.
- Treating a task status, heartbeat, or `success` field as completed work.
- Running agents in the same dirty checkout, allowing silent overwrites or
  ambiguous ownership.
- Copying only a final summary while losing raw logs and source hashes.
- Accepting HTTP 200, `/healthz`, MJPEG, or CUDA as proof of ASR content.
- Consuming a lazy ASR generator once for text and again for JSON segments.
- Letting a pending session be represented by an empty JSON object.
- Asking the same agent to implement and approve its own work.
- Using a patch whose paths describe temporary evidence files rather than the
  repository paths; always run `git apply --check` from a clean checkout.
- Starting deployment before proving the fixed image or artifact is actually
  the one running.

### Better patterns

- One issue, one owner, one isolated workspace, one evidence directory.
- RED first, then implementation, then GREEN, then independent review.
- Persistent machine-readable evidence with commands, exit codes, hashes, and
  identities.
- Cross-artifact tests that catch omissions such as a missing session ID in
  only one index or a missing 30B transcript.
- Explicit state labels: `PENDING`, `BLOCKED`, `GREEN`, `REVIEWED`, and
  `ACCEPTED` mean different things.
- Read-only independent review with direct artifact citations.
- Rollback identity captured before deployment.

## Reusable Xiaofa dispatch prompt

```text
You are the implementation worker. Work only on: <one bounded scope>.

Workspace: <exact clean clone or worktree>
Evidence directory: <persistent path>
Allowed paths: <list>
Forbidden: no invented data, no empty placeholders, no merge, no deploy,
restart, or hardware mutation unless explicitly authorized.

First record pwd, git root, branch, commit, and status.
Then run the RED command and save its complete output. Stop if the baseline
does not fail as specified.

Implement the smallest fix. Run the GREEN commands and save complete outputs,
changed-file list, diff check, source metadata, hashes, and runtime identity.

Close with: status, commit, exact commands and exit codes, evidence paths,
limitations, rollback details if authorized, and the next reviewer command.
Do not report complete when an evidence file is missing.
```

## Orchestrator closeout checklist

- [ ] Scope and allowed paths are explicit.
- [ ] Workspace is isolated and baseline recorded.
- [ ] RED test fails for the intended reason and output is saved.
- [ ] Worker diff is focused and artifacts are persistent.
- [ ] GREEN tests and content invariants pass.
- [ ] Independent reviewer returns a cited result.
- [ ] Commit/PR identity is recorded.
- [ ] Deployment identity and rollback are recorded when applicable.
- [ ] Browser/user-facing behavior is verified.
- [ ] Final report separates observed facts, inference, and remaining risk.
