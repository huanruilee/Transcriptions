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

Before assigning content work, run a worker smoke gate in a disposable
workspace. The worker must create one named evidence file, return a Kanban
terminal event (`complete` or `block`), and leave the file readable after the
process exits. A clean exit without that terminal event, a tool-parser error,
or an empty workspace is a runner failure; do not retry the content task in
the same workspace until the process is reclaimed and the failure is recorded.
Never launch a manual worker while the dispatcher can still claim the same
task. If manual recovery is unavoidable, atomically claim the task first,
disable or stop the duplicate dispatcher process, and use an explicit
absolute workspace path rather than parsing human-readable CLI output.
The worker must `cd` into the assigned workspace before loading project
context, print `pwd`, and fail closed if `pwd` or the resolved evidence root is
outside that workspace. A profile's remembered checkout, skill example,
`TERMINAL_CWD`, or `/home/henry/.gx10/xiaofa/workspace` must never override the
task workspace. Any write outside the assigned workspace is an immediate
runner failure and must be reported with the path.

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

### M3.5: Freeze the editorial input

Before dispatching a transcript editor, the orchestrator must create a
machine-readable input manifest in the worker workspace. The manifest must
identify the exact session, sentence or time range, raw-ASR file hash, audio
path/URL, duration, source-page paths and hashes, glossary/version, baseline
published-file hash, and expected output files. The editor must not
rediscover the repository, select a different audio file, or silently
consume a newer baseline.

Use separate preparation and editorial tasks:

1. Preparation resolves identities, extracts source spans, records hashes, and
   produces the manifest. It may not edit published transcript content.
2. Editorial consumes the manifest, edits only the allowed published layer,
   and produces the correction ledger and samples. It may not change raw ASR,
   timestamps, source files, inventory, or tests.

The preparation task is not complete until every manifest path exists and its
hash can be recomputed. A manifest mismatch is BLOCKED, not an invitation for
the editor to guess.

### M3-content: Transcript editorial quality

For a Buddhist lecture transcript, structural validity is not editorial
acceptance. Give the worker these four separate obligations:

1. **Textual grounding**: compare doctrinal terms and quoted passages with the
   matching `source_text/page_*.txt` pages and record the source location for
   each non-obvious correction.
2. **Terminology**: check Chinese Buddhist terms, Tibetan Buddhist names, and
   school-specific transliterations against the course glossary or source text.
   Never promote an uncertain homophone to a global replacement.
3. **Punctuation**: add Chinese punctuation to the published `text` while
   preserving the spoken wording. Every substantive published sentence should
   end with an appropriate punctuation mark; `rawText` must remain unchanged.
4. **Paragraphing**: split paragraphs at a real discourse/topic boundary,
   preserve sentence timestamps, and attach headings only when the source or
   audio supports the boundary. A paragraph count or average size wildly
   outside neighboring sessions is a review failure, not a formatting choice.

For uncertainty, use an explicit review ledger with `CONFIRMED`, `LIKELY`, or
`UNCERTAIN`. `UNCERTAIN` means retain the raw wording, flag the timestamp, and
do not silently invent a doctrinal term. The worker must provide before/after
samples from the beginning, middle, every heading boundary, and the ending.

For a large or malformed session, split the work into two cards. A preparation
card materializes the immutable input slice, source-page spans, audio identity,
and baseline hashes. An editorial card receives that fixed manifest and may
only produce the published-layer text, paragraph assignments, and ledger. Do
not ask one worker to discover files, infer audio boundaries, redesign tests,
and edit the transcript in the same turn; that combination has repeatedly
produced tool loops and unverifiable summaries.

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

For editorial content, additionally require:

- punctuation and paragraph metrics compared with at least two neighboring
  sessions;
- a list of every unresolved phrase and its timestamp;
- source citations for doctrinal and Tibetan-term corrections;
- proof that `rawText` and timestamps were not rewritten by the editor;
- independent review of representative passages, not just JSON shape.

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

The reviewer must inspect the exact artifact named by the manifest and record
its commit and file hashes. A worker's final summary, task status, heartbeat,
or claimed sample count is only a pointer to evidence; it is never evidence
itself. If the summary and files disagree, classify the delivery as BLOCKED
and preserve both outputs for diagnosis.

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

## Recovery pattern for slow or ambiguous Agent runs

When a full-session editor or reviewer stalls during initialization, do not
retry the same broad prompt in the same workspace. Reclaim the process, keep
the fixed manifest, and reduce the next task to a short audio window plus the
smallest source-text span that can decide one issue. Run at least two decoding
settings when the phrase is acoustically uncertain, but treat agreement as
ASR evidence rather than editorial proof.

For repeated lessons in the same course, use the matching lesson transcript as
secondary context only after locating the same doctrinal passage. Record the
cross-session file and relevant timestamps, and distinguish that corroboration
from direct audio evidence. A phrase that remains unresolved after short-window
decoding and cross-session comparison must stay in the uncertainty ledger and
must block `PUBLISHED` status until a human or stronger audio review resolves
it.

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

### Lessons from the 30B incident

The previous workflow and prompts were consulted, but consultation alone did
not preserve their quality. The following failure chain is now an explicit
gate:

1. A malformed published baseline was treated as an editorial task, although
   it first needed a bounded recovery plan.
2. One broad prompt asked the worker to discover inputs, interpret source
   material, listen to audio, edit text, paragraph the lecture, and prove the
   result. This created exploration loops and made the final claim hard to
   reproduce.
3. A stale profile checkout or inherited terminal cwd could override the
   assigned workspace. The worker must prove its path before loading any
   project context.
4. Dispatcher and manual recovery workers could run concurrently. There must
   be one claimant and one writer per task; a second process is a runner
   failure until the first is stopped and the task is reclaimed.
5. Structural GREEN checks were mistaken for editorial acceptance. Punctuation,
   paragraph boundaries, terminology, source grounding, and raw-to-published
   traceability require their own content gates.
6. Broad or contradictory patterns encouraged blind substitutions. Tests must
   reject blanket homophone replacement and require uncertainty to remain
   visible in the ledger.

Never describe a result as "following the previous prompt" unless the new
run has reproduced the previous workflow's inputs, model/runtime identity,
stage outputs, and independent review. Record which parts were reused and
which were intentionally changed.

### Dispatch preflight and stop conditions

Before a content worker starts, the orchestrator records a preflight receipt:

task_id, owner, reviewer, workspace, branch, baseline_commit
manifest_hash, audio_hash, source_hashes, allowed_paths
red_command, green_commands, evidence_dir, worker_profile, runtime_identity

Stop immediately when any of these occurs:

- the worker writes outside the assigned workspace or evidence directory;
- two workers claim the same task or edit the same output;
- a background launch does not have an independently verifiable timeout and
  PID or process-group ownership;
- the worker cannot emit a terminal event and reproducible evidence;
- the input manifest is missing, stale, or incomplete;
- the output summary cannot be reconciled with the files;
- a test passes only because the fixture or baseline changed unexpectedly.

On stop, archive the logs and mark the task BLOCKED; do not restart in the
same workspace and do not accept partial content as a successful milestone.

### Prompt quality rules

The reusable prompt is a contract, not a description of the desired outcome.
Every dispatch must state one bounded unit of work, exact input manifest,
allowed output paths, forbidden mutations, RED/GREEN commands, evidence
schema, and stop conditions. Prefer several short prompts with an artifact
handoff over one "finish the whole session" prompt. The orchestrator owns
interpretation of a failed result; the worker must not self-upgrade
PENDING, BLOCKED, or GREEN to ACCEPTED.

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

First `cd` to the exact workspace, record `pwd`, and assert that the resolved
project root and evidence directory are descendants of that workspace. Then
record git root, branch, commit, and status. Abort and report the path if any
profile memory or inherited `TERMINAL_CWD` points elsewhere.
Then run the RED command and save its complete output. Stop if the baseline
does not fail as specified.

Implement the smallest fix. Run the GREEN commands and save complete outputs,
changed-file list, diff check, source metadata, hashes, and runtime identity.

For transcript editorial work, also produce a review ledger and samples for
the first, middle, last, and every heading-bounded passage. Add punctuation
and paragraphs only in the published layer. Preserve raw ASR and mark any
uncertain doctrinal or Tibetan term instead of guessing.

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
