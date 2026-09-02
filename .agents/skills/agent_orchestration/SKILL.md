---
name: agent-orchestration
description: Evidence-first workflow for delegating repository fixes to isolated agents, independently reviewing their deliveries, and closing only after reproducible verification.
---

# Evidence-First Agent Orchestration

Use this skill when a repository change is delegated to another agent and the
orchestrator must retain control of scope, evidence, and acceptance.

This skill is an operating procedure, not a prompt-writing guide. The
orchestrator owns the acceptance decision; the worker owns implementation
within the stated boundary; the reviewer owns an independent challenge of the
worker's evidence.

## Workflow

1. **Inspect the baseline**
   - Read the current worktree, branch, tests, and relevant project skills.
   - Preserve unrelated user changes; never use a shared dirty checkout for an
     agent task.
   - Record the exact bug contract and the files that must change.

2. **Create an isolated task**
   - Use a dedicated scratch or worktree workspace and a branch with an agent
     identity in the author metadata. A Kanban scratch directory is not
     automatically a Git checkout: clone into a child directory first, then
     verify `git rev-parse --show-toplevel` there.
   - Put all constraints in the task body: source-of-truth rules, forbidden
     shortcuts, acceptance criteria, test commands, and delivery format.
   - Keep remote and local workspaces separate from other agents.
   - Prefer a pre-provisioned persistent directory for evidence-heavy work.
     Scratch workspaces may be garbage-collected or retain only a short task
     summary. Never make a delivery depend on files that exist only in a
     transient worker workspace.

3. **Test before implementation**
   - Require an intentional RED regression test before production edits.
   - The test must be grounded in an independent authoritative inventory or
     source, not merely in the artifact currently being audited.
   - Save the RED output as part of the task evidence.
   - Name the contract in plain language: what must fail on the baseline and
     what exact behavior must pass after the change.

4. **Require source-grounded delivery**
   - For transcription data, require a verified audio/source URL, content type,
     duration, non-empty timestamped ASR, monotonic timestamps, and provenance.
   - Never turn an HTTP 200, health check, or empty ASR response into content
     acceptance.
   - If a dependency is unavailable, submit a reproducible BLOCKED report and
     do not create placeholder or invented content.

5. **Review independently**
   - Assign a separate agent in a separate workspace to review the delivered
     branch or PR without modifying or merging it.
   - Require concrete commands, files, hashes or raw outputs, severity, and an
     explicit `DO NOT MERGE` verdict when acceptance is not proven.
   - Resolve disagreements by checking the strongest source directly. A source
     file's existence is not, by itself, proof that it belongs to the intended
     course or inventory.
   - A reviewer that only emits heartbeats, starts a tool process, or leaves a
     task in `running` has produced no review. Apply a bounded timeout, stop the
     stale run, record the cause, and retry with a minimal task or another
     profile. Do not convert a worker's own summary into independent approval.

6. **Orchestrator acceptance gate**
   - Inspect the diff and provenance independently.
   - Run targeted tests, relevant acceptance tests, and the full suite when
     practical from a clean isolated checkout.
   - Accept only when the implementation, tests, source evidence, and review
     all agree. Otherwise keep the task open or blocked with the exact missing
     evidence.

## Task state machine

Move a task through these states in order. Do not skip a gate because the next
state is operationally easier.

1. `SPECIFIED`: one scope, one owner, explicit forbidden actions, and named
   acceptance artifacts.
2. `RED`: baseline failure is reproduced and saved.
3. `IMPLEMENTED`: worker changes exist in the isolated workspace and are
   limited to the scope.
4. `GREEN`: targeted tests pass and the evidence bundle is complete.
5. `REVIEWED`: a different agent independently returns PASS with commands and
   paths, or returns FAIL with actionable findings.
6. `INTEGRATED`: commit/PR exists with the intended author identity and no
   unrelated staged changes.
7. `DEPLOYED`: deployment was explicitly authorized, runtime health is proven,
   and rollback information is saved.
8. `ACCEPTED`: full regression and user-facing/content acceptance pass.

If a state is uncertain, remain in the earlier state. In particular, `GREEN`
does not imply `REVIEWED`, and `DEPLOYED` does not imply `ACCEPTED`.

## Durable evidence contract

Every implementation task must nominate one persistent evidence directory and
write a machine-readable or plain-text record there before completion. At
minimum record:

- task ID, worker profile, workspace path, repository root, branch, and commit
- exact commands and exit codes
- RED and GREEN outputs, not only a prose summary
- changed-file list and a diff check
- source URL/path, content type, duration, hash, and model/runtime identity when
  media or ASR is involved
- independent review result and residual risks
- deployment status, image/container identity, health output, and rollback
  command when deployment is authorized

At task close, verify the directory exists and every required artifact is
readable. A task result, heartbeat, or Kanban metadata field is not a
substitute for the files themselves.

## Dispatch checklist

Before dispatching a worker, include all of the following in the task body:

```text
Scope: one bug and allowed paths.
Workspace: exact persistent path; first commands are pwd, git root, status.
RED: exact baseline command and expected failure.
GREEN: exact tests and invariants.
Evidence: required files, raw outputs, hashes, and metadata.
Forbidden: no invented data, placeholders, merge, restart, or deploy.
Close: complete only after artifact existence checks and a concise handoff.
```

After dispatch:

1. Poll for a useful tool result, not merely a heartbeat.
2. Inspect the persistent evidence directory independently.
3. If the worker stalls, use a bounded retry with a smaller task. Keep the
   provider/model override task-local; do not rewrite a shared profile config.
4. Only then dispatch the independent reviewer against the persistent paths.

## Failure classification and recovery

- **Workspace failure:** wrong root, dirty shared checkout, or missing clone.
  Stop before editing; provision a clean persistent workspace.
- **Evidence failure:** task says done but required files or raw outputs are
  absent. Reopen or rerun the task; do not accept the summary.
- **Capability failure:** worker emits only heartbeats or cannot use the needed
  tool. Record the bounded run, retry minimally, then escalate or block with
  evidence.
- **Content failure:** audio is reachable but transcript is empty, untimestamped,
  or not source-grounded. Keep the UI pending marker and do not publish a
  placeholder session.
- **Deployment failure:** image was rebuilt but the running container is old,
  or health is green while the intended behavior is wrong. Stop at deployment
  verification and preserve rollback evidence.

## Transcription closeout gate

For a new session, require all of these before publishing:

1. official inventory identifies the session and audio;
2. the fetched audio has stable URL/path, content type, duration, and hash;
3. raw ASR is non-empty and contains monotonic `start`, `end`, and `text`;
4. correction/provenance preserves the relationship between raw ASR, source,
   and published text;
5. an independent review checks representative audio/text alignment;
6. targeted, full, and cross-artifact tests pass;
7. the published TOC/sidebar points to the real session, not a pending marker;
8. deployment/runtime evidence proves the site serves the new artifact.

If any item is missing, the correct outcome is `PENDING` or `BLOCKED`, never a
synthetic empty session.

## Workspace bootstrap check

For a scratch task, the first commands should be equivalent to:

```sh
pwd
git clone <repository-url> repo
cd repo
git status --short --branch
git rev-parse --show-toplevel
```

Never fall back to another agent's checkout when the scratch directory is not
initialized. If cloning fails, block the task with the command output.

## GX10 profile fallback

When dispatching through a GX10 profile, treat the profile's configured
terminal cwd as a fallback only; it may be a shared workspace. Prefer a
pre-provisioned clean clone passed with `workspace=dir:<path>`, and record its
`pwd`, repository root, branch, and status before the worker starts. If a
scratch worker stops after the first non-Git check, do not let it guess a
different checkout: stop the run, provision a clone, and retry in that exact
directory.

For a worker that stalls before its first useful tool result, run a bounded
read-only model probe and retry with a task-level known-good provider/model
override when available (for example `vllm-local/Qwen3.8-27B`). Keep this
override at task scope so the profile's shared gateway configuration is not
changed. Use a minimal task with no forced large skill for environment
acceptance; load domain skills only after the bootstrap gate passes. Record
each blocked run and its cause rather than treating a live process as success.
Do not assume that a different profile is independent merely because its name
differs: independence requires a new task context, read-only posture, separate
workspace, and a review result that cites the artifacts directly.

## Transcription-specific evidence split

Keep these claims separate:

- An official index entry proves that a session/audio slot exists.
- HTTP status, content type, duration, and a hash prove that an audio object is
  reachable and stable.
- Non-empty timestamped ASR plus source-grounded review proves transcript
  readiness.
- A published session entry proves that the website may treat the transcript
  as complete.

When audio exists but transcript evidence is unavailable, register the slot in
the repository's explicit unavailable/pending status so the UI does not hide
it. Do not add an empty session JSON or put the slot in both published and
unavailable collections. A pending marker is an honest UI fix; it is not
transcript acceptance.

7. **Closeout**
   - Report what changed, what was tested, the exact PR/commit, independent
     review result, and any residual limits.
   - Do not claim `OK`, `validated`, or `complete` from a partial artifact.

## Reusable task template

Include these sections in delegated tasks:

- **Scope:** one bug and explicit file boundaries.
- **Evidence:** authoritative source URLs/files and required hashes or raw logs.
- **RED gate:** the failure that must be reproduced first.
- **GREEN gate:** exact invariants and commands required for acceptance.
- **Forbidden actions:** no invented data, no empty placeholders, no merge, and
  no destructive service or hardware mutation without authorization.
- **Delivery:** branch/PR, test output, limitations, and review handoff.
