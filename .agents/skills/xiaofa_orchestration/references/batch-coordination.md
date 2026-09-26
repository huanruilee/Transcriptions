# Low-token playlist coordination

## Lessons from the September 2026 runs

- Isolated clones, source manifests, raw ASR, RED/GREEN logs, commits and
  temporary-media cleanup produced useful, reproducible artifacts.
- Repeated 30-60 second polling and restarting live workers wasted coordinator
  context. Several workers later delivered results after being called blocked.
  A sleeping process, `futex`, a models response or an unchanged stdout file
  does not diagnose a deadlock, a model failure or a healthy tool loop.
- Mechanical reviewers verified counts, ordering and video IDs, not actual
  audio alignment, faithful proofreading or teaching-summary accuracy.
- An inventory of an old main checkout omitted work already discussed in
  PR #213. Reconcile branches and source identities before new transcription.
- Do not require four questions per session or infer lesson count by dividing
  playlist length by two. Derive questions and upper/lower mappings from source.
- Goal-level token totals are not an itemized bill for coordinator versus
  local agents. Report attribution as unavailable unless measured.

## Baseline and isolation

Before dispatch, compare current main, relevant open PR heads, worker branches
and existing source artifacts. Join by course ID and video ID, not filename
alone. Classify each video as absent, candidate, reviewed, published or
unavailable; reuse hash-verified work and preserve existing URL/session IDs.
Use one repository issue or PR checklist to track the full inventory.

Create a task-specific profile with only necessary configuration. Do not copy
the whole profile with sessions, state databases, caches and logs. Resolve
credentials through the existing approved mechanism without printing secrets.
Verify effective terminal cwd and provider/model through actual tool execution.
A reviewer needs a fresh context and a separately configured, frozen checkout;
a prompt naming a different directory is insufficient.

## Work distribution

The coordinator defines scope, chooses a verified baseline, examines compact
receipts and adjudicates exceptions. GX10 workers perform source retrieval,
ASR, proofreading and evidence collection. Deterministic scripts handle hashes,
inventory joins, validation, tests and status aggregation. A separate GX10
reviewer challenges editorial and alignment evidence at the submitted commit.

Use a reusable stage runner rather than rediscovering commands in every prompt:

`SOURCE -> ASR -> EDIT -> STRUCTURE -> VERIFY -> REVIEW -> PR -> DEPLOY`

This runner is a proposed implementation, not a claim that it already exists.
First inspect existing runners and extend them where possible. Each stage
consumes exact paths/hashes, checkpoints output and retries only its failed
unit. Freeze the relevant test contracts before editorial work; reject changes
that weaken them just to pass. Parameterize shared contracts across the course
instead of copying one batch test for every pair of files.

Start with one end-to-end batch. Once it is accepted, unrelated preparation or
ASR work may overlap review within measured GPU capacity. Keep one writer per
checkout and serialize shared course indexes and publication.

## Monitoring contract

Have the runner atomically write a small status receipt with:

`task_id, stage, status, workspace, baseline_sha, pid, process_start,
heartbeat_at, last_progress_at, completed_units, total_units, artifact_paths,
test_counts, candidate_sha, remote_sha, error_code, next_action`

Use explicit states: RUNNING, WAITING, FAILED, NEEDS_INPUT, COMPLETE. Keep test,
content-review and deployment verdicts separate. A heartbeat proves liveness,
not useful progress; counters and new validated artifacts prove progress.

Prefer stage-completion events. If polling is necessary, let a lightweight
watcher inspect locally and return changes only. Calibrate deadlines from
observed stage times, audio duration and queueing; 2-5 minutes of silent ASR or
reasoning is not a universal failure threshold. Do not call model orchestration
for every unchanged poll. Do not create recurring automation unless authorized.

After a missed expected progress window, inspect the same run's tool history,
child process, request state and artifacts. Reconnect after transport failure.
Cancel only under the applicable authorization and documented deadline, with
PID/start identity verified. Never restart on observation timeout alone.
Mark the overall goal blocked only at a genuine impasse requiring external
action, following the goal's blocked-audit rules; a live job is a verified wait.

Read a compact receipt first (target <= 1 KB). On failure fetch the named error
and a bounded log excerpt. Fetch source excerpts only to decide concrete
findings. Keep full transcripts and logs in evidence storage.

## Acceptance scope

1. Structure: valid schema, coverage, consistent indexes, resolvable references,
   nonempty sentences, valid timing bounds, remote playback metadata.
2. Content: source-grounded terms, punctuation and paragraph boundaries,
   actual spoken questions, teacher-section boundaries, faithful summaries,
   verse citations and an explicit uncertainty ledger.
3. Alignment: source-linked checks at opening, middle, end, question/teacher
   transitions and flagged spans. Timing monotonicity alone is insufficient.
   Record sampled versus exhaustive coverage honestly.
4. Publication: verified remote SHA, PR/check status, authorized integration,
   deployment artifact and live course/TOC/playback checks. A branch push is
   not a published session.

Reviewer output cites the frozen commit, inspected sources/time ranges,
commands and concrete findings. Mechanical PASS cannot upgrade content or
alignment to PASS. Expand review when samples expose systematic faults.
Keep the private name hint list out of public artifacts. Retain required source
provenance while deleting temporary audio after processing and verification.

## Next implementation plan (not executed by editing this skill)

1. Reconcile live workers and existing branches, especially PR #213, against
   the playlist inventory; identify reusable work and actual remaining gaps.
2. Specify the runner/status contract. Write failure tests for slow live jobs,
   transport loss, wrong cwd, stale baseline, duplicate source IDs and false
   promotion of structural PASS to editorial acceptance.
3. Extend the existing runner with checkpointing and compact receipts. Preserve
   ongoing runs and verify recovery against saved artifacts.
4. Complete one batch through independent content/alignment review and a real
   deployed review page, using existing authorization for each action.
5. Process remaining verified source IDs with the same pipeline. Report only
   milestone results or actionable failures, with GitHub tracking each session.

Measure coordinator input/output tokens where available, status-call count,
elapsed time per accepted session, retries, rework and review failures. Optimize
coordinator tokens per accepted published session, not just output brevity.
