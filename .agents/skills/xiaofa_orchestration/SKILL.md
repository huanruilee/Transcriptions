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
Scope: one bounded session or cluster (e.g. 03B or 03B..07B); list allowed paths.
Preflight: verify Whisper GPU (8010) and vLLM (8001/4001) health.
Baseline: branch, commit, workspace root, and current completeness audit count.
RED: exact command (e.g., npm run test:completeness:strict) and expected missing failure.
GREEN: exact invariants and commands that must pass (e.g., npm run test:completeness).
Source: canonical 219 web URL (https://buddha.flyday.com.tw/...) and source_text pageRange.
Evidence: persistent directory and required raw artifacts.
Forbidden: placeholders, invented data, merge, deploy, restart, hardware mutation.
Closeout: branch/commit, test output, diff, reviewer handoff, residual risk.
```

Do not let a worker infer a broad goal from a short sentence. A task should be
small enough that its failure has one primary cause.

### Automated Manifest & Turnkey Dispatch Assistant
Use the automated dispatch assistant to inspect session inventory or generate batch task prompts:
```sh
python3 scripts/prepare_session_manifest.py --list      # Inspect session inventory
```

### Preflight: Verify local microservices health & SSH Tunnel
All 219 sessions have been 100% transcribed. For ongoing calibration and proofreading, the system uses a **Zero-Token SSH Tunnel Decoupled Orchestration Architecture**:
* **Mac Orchestrator**: Maintains clean local git worktree, executes test suites (`npm test`), and dispatches batch tasks without burning cloud context tokens.
* **Remote GX10 Host**: Headless GPU compute host hosting Whisper (Port 8010) and vLLM Qwen3.8-27B (Port 8001).

1. Establish SSH local port forwarding tunnel:
```sh
ssh -f -N -L 18001:192.168.122.1:8001 gx10
```
2. Verify endpoints:
```sh
# Local tunnel to remote vLLM Qwen3.8-27B:
curl -s http://127.0.0.1:18001/v1/models

# Remote Whisper microservice (direct or via tunnel):
curl -s http://127.0.0.1:8010/health
# Expected: {"backend":"cuda","compute_type":"int8","device":"cuda","model_loaded":true,"status":"ok"}
```
If either service is unresponsive, halt with `BLOCKED`.

### Pipeline Execution Invariants & Field-Tested Lessons
Based on the full 219-session production rollout and continuous calibration:
1. **Decoupled Local/Remote Architecture**:
   - Do NOT run interactive git operations or maintain a shared dirty clone directly on gx10 (`/home/henry/.gx10/xiaofa/workspace`).
   - Run Python drivers locally on Mac via port forwarding (`http://127.0.0.1:18001/v1`), keeping code edits and git history strictly local, clean, and testable.
2. **Zero-Token Orchestrator Invariant**:
   - The Orchestrator (Claude / Antigravity) must never load full session transcripts into the cloud conversation context. All heavy semantic diffing and parsing must be delegated to local scripts running against the local Qwen3.8-27B endpoint.
3. **Mandatory Post-Processing Sanity Gates**:
   - **Traditional Chinese Purity Gate**: Immediately pass output JSON through OpenCC `s2twp` or strict dictionary substitution; verify with `node --test tests/unit/traditionalChinesePurity.test.js`.
   - **Phonetic Corruption Blacklist Gate**: Run `node --test tests/unit/asrIntegrityGate.test.js` to catch any homophone slips.
   - **Physical Line Boundary Verification**: Ensure session headings never overshoot the physical text cutoff in `source_text/page_XXX.txt`.
   - **Historical Filter Invariant**: Preserve required filter tokens in early session summaries (e.g. `歸敬頌` in 01, `釋禮敬` in 02A) to satisfy `tests/unit/sidebarFilterBehavior.test.js`.
4. **Cluster Pipeline Execution**:
   - Execute calibration in 8 structured clusters (`scripts/gx10_calibrate_kepan.py --cluster {1..8}`).
   - Verify 100% pass across all 279 unit and acceptance tests before opening PR with auto-merge enabled.

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
change or missing session transcription, test the contract across all relevant artifacts:

- for missing sessions: `npm run test:completeness:strict` must fail and explicitly cite the target session as missing from the 219 web catalog;
- official session inventory contains the expected session;
- `course.json`, session JSON, `audio_map`, and sidebar agree;
- published session has non-empty text and timestamped monotonic segments;
- source URL, duration, hash, and engine metadata are present;
- pending/unavailable status is not mixed with a published session.

Save the command and complete failing output. If the test passes before the
fix, stop and explain why the baseline is not the expected baseline.

### M3: Execution Tracks: End-to-End Pipeline vs. Surgical Editorial

Select the correct operational track for Xiaofa based on the task type:

#### Track 1: New Session Grounded Transcription (Batch Pipeline)
When commissioning a missing session (e.g. `03B`, `04B`):
1. **Pre-requisite**: Ensure the session entry exists in `course.json` with its authoritative `pageRange` (e.g. `p.66`) and in `audio_map.json` with its Flyday URL.
2. **Execute Standard Pipeline**: Xiaofa MUST invoke the proven 5-step automated pipeline rather than writing ad-hoc scripts:
   ```sh
   python3 scripts/batch_convert_all.py --sessions <SID>
   ```
3. **Invariants**:
   - Materializes `courses/入中論善顯密意疏/sessions/session_<SID>.json`.
   - Never overwrite or modify unrelated existing session JSON files.
   - Text is 100% Traditional Chinese with monotonic timestamps.

#### Track 2: Existing Session Deterministic Audit & Surgical Remediation
When fixing homophones or adjusting headings in an existing session (e.g. `30B`):
- Run `npm run audit:transcript` with `--report` and `--apply-confirmed`.
- Use `scripts/active_learning_manager.py` for ambiguity arbitration.
- Preserve raw ASR and timestamps; do not blindly overwrite spoken words.

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
- completeness audit confirms that the missing backlog decreased monotonically without regressions:
  ```sh
  npm run test:completeness
  ```
- relevant unit and schema tests pass:
  ```sh
  npm run test:unit
  ```
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

### Token-Efficient Evidence Compression (Preventing LLM Token Waste)

To prevent orchestrator context window bloat and eliminate excessive token consumption:
1. **No Raw Transcript Dumps**: Workers MUST NOT print complete transcripts, raw Whisper JSON outputs, or thousands of sentence lines into terminal stdout.
2. **File Persistence**: All detailed logs, diffs, and raw transcripts must be saved directly to `reviews/evidence/<SID>_transcription/` or `reviews/evidence/batch_<N>_transcription/`.
3. **Structured Stdout Progress Card**: Workers must output ONLY a compact, structured completion card to stdout (< 200 tokens per session):
```text
==============================================================
✅ [Session <SID> Completed]
• Audio Source: <FILENAME> (Duration: <MMm SSs>, SHA-256: <HASH>)
• Grounded Pages: <PAGE_RANGE> (<SOURCE_FILE>)
• Transcribed: <N> sentences | <M> paragraphs | <K> subheadings
• Audio Sync Match: <PCT>% (Threshold: >= 75%)
• Evidence Directory: reviews/evidence/<SID>_transcription/summary.md
• Verification: npm run test:unit (PASS) | Completeness (-1 missing)
==============================================================
```

### Deterministic candidate audit for a weaker worker

Before asking Xiaofa to reason over a complete transcript, run the repository
candidate auditor. It converts known ASR failure modes into bounded rules with
positive fixtures, negative fixtures, source evidence, and a machine-readable
ledger. The worker is an executor of this contract, not the authority that
decides an unsupported reading.

Run a dry audit first:

```sh
npm run audit:transcript -- \
  --session courses/入中論善顯密意疏/sessions/session_30B.json \
  --source-range 95-105 \
  --report reviews/session_30B_automated_audit.json
```

The report separates `CONFIRMED` candidates from residual warnings. Inspect the
report and its source citations before applying anything. Then, and only then,
apply confirmed candidates:

```sh
npm run audit:transcript -- \
  --session courses/入中論善顯密意疏/sessions/session_30B.json \
  --source-range 95-105 \
  --report reviews/session_30B_automated_audit.json \
  --apply-confirmed
```

Required invariants:

- `rawText`, timestamps, paragraph identity, and `sourceSegmentId` never change;
- every applied correction records before, after, confidence, rule IDs, and
  source or audio evidence in `_meta.candidateEvidence.applied`;
- numbered grounds such as `二地菩薩` remain unchanged;
- a replacement that leaves a known artifact still emits a residual warning;
- `LIKELY` and warning items are review tasks, never automatic edits;
- rerunning the dry audit after application must yield zero known candidates
  and zero residual warnings before the worker may report deterministic GREEN;
- deterministic GREEN still requires representative audio/source review and
  does not by itself authorize `PUBLISHED` status.

This split reduces model dependence: source-backed recurring errors are handled
by tested code, while Xiaofa spends its limited reasoning only on the small
uncertainty queue. When a new human-confirmed error is found, add one positive
fixture, one false-positive fixture, and one evidence-bearing rule before using
it on another session.

Run the blocking gate after application:

```sh
npm run audit:transcript -- \
  --session courses/入中論善顯密意疏/sessions/session_30B.json \
  --source-range 95-105 \
  --fail-on-review
```

Exit `0` means no known candidate or review warning remains. Exit `2` means the
worker must return the generated segment queue for review and must not claim
completion. Preserve cumulative audit-run counts so a later pass cannot erase
the evidence from an earlier pass.

For an ambiguous audio span, use this adjudication order:

1. cut a timestamped clip and record its SHA-256;
2. compare raw ASR, the local sentence window, the matching source page, and at
   least one independently produced decode;
3. treat parameter changes on the same ASR model as corroboration, not as an
   independent reviewer;
4. auto-apply only when the wording is source-compatible and the evidence does
   not conflict;
5. if a later decode conflicts with a `CONFIRMED` choice, revert that choice,
   remove it from the applied ledger, and place the segment back in the review
   queue;
6. send only the compact unresolved queue to a stronger or human reviewer.

This makes weak-agent work efficient: deterministic scans handle the full
transcript, while expensive reasoning is limited to timestamped exceptions.

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

## Reusable Xiaofa dispatch prompts

### Template A: New Session Grounded Transcription (Missing Sessions Commissioning)
```text
You are the implementation worker (小法). Work only on transcribing and indexing session <SID>.

Workspace: /home/henry/.gx10/xiaofa/workspace/Transcriptions
Evidence directory: reviews/evidence/<SID>_transcription
Allowed paths:
- courses/入中論善顯密意疏/sessions/session_<SID>.json
- courses/入中論善顯密意疏/course.json
- courses/入中論善顯密意疏/audio_map.json
- courses/入中論善顯密意疏/toc.json

Forbidden: No fake/placeholder JSON, no invented words, no modifying unrelated sessions, no editing tests.

Step 0 (Preflight):
1. `cd /home/henry/.gx10/xiaofa/workspace/Transcriptions` and verify `pwd`.
2. Check Whisper GPU: `curl -s http://127.0.0.1:8010/health`
3. Check Qwen vLLM: `curl -s http://192.168.122.1:8001/v1/models`
   If either fails, stop immediately with BLOCKED.

Step 1 (RED Test):
Run `npm run test:completeness:strict` and record that session <SID> is missing.

Step 2 (Execution):
Run the verified batch conversion pipeline:
`python3 scripts/batch_convert_all.py --sessions <SID>`

Step 3 (GREEN Test):
1. Verify transcript non-emptiness: `session_<SID>.json` has valid paragraphs and monotonic timestamps.
2. Ensure course.json and audio_map.json contain <SID> with official Flyday URL: <OFFICIAL_FLYDAY_URL>.
3. Add <SID> to toc.json coverage.missingAnchors (if not anchored yet).
4. Run `npm run test:completeness` to confirm missing session count dropped by 1.
5. Run `npm run test:unit` to verify zero regression.

Step 4 (Closeout):
Save evidence bundle (hashes, sentence count, duration, test output) to reviews/evidence/<SID>_transcription/summary.md.
```

### Template B: Existing Session Surgical Remediation
```text
You are the implementation worker. Work only on: <one bounded scope>.

Workspace: <exact clean clone or worktree>
Evidence directory: <persistent path>
Allowed paths: <list>
Forbidden: no invented data, no empty placeholders, no merge, no deploy,
restart, or hardware mutation unless explicitly authorized.

First `cd` to the exact workspace, record `pwd`, and assert that the resolved
project root and evidence directory are descendants of that workspace. Then
record git root, branch, commit, and status.
Then run the RED command and save its complete output. Stop if the baseline
does not fail as specified.

Implement the smallest fix. Run the GREEN commands and save complete outputs,
changed-file list, diff check, source metadata, hashes, and runtime identity.

For transcript editorial work, run `npm run audit:transcript -- --session <PATH> --apply-confirmed`.
Add punctuation and paragraphs only in the published layer. Preserve raw ASR and mark any
uncertain doctrinal or Tibetan term instead of guessing.

Close with: status, commit, exact commands and exit codes, evidence paths,
limitations, rollback details if authorized, and the next reviewer command.
Do not report complete when an evidence file is missing.
```

### Template C: Cluster Batch Calibration & Zero-Token Orchestration
```text
You are the Orchestrator. Calibrate Cluster <N> of the 219-session library using zero cloud context tokens.

Preflight:
1. Ensure SSH tunnel is active: `ssh -f -N -L 18001:192.168.122.1:8001 gx10`
2. Probe vLLM model endpoint: `curl -s http://127.0.0.1:18001/v1/models`

Execution:
1. Create dedicated branch: `git checkout -b remediate/cluster-<N>-kepan`
2. Run local batch calibration driver:
   `python3 scripts/gx10_calibrate_kepan.py --cluster <N>`
3. Run complete test suite:
   `npm test`
   Invariant: Must pass 100% (279 passed, 0 failed).

Integration & Deployment:
1. Commit: `git commit -m "remediate(cluster-<N>): calibrate kepan and session headings via gx10 Qwen3.8-27B"`
2. Push & open PR: `gh pr create --title "..." --body "..."`
3. Enable auto-merge: `gh pr merge <PR_NUMBER> --squash --auto`
4. Confirm merge and GitHub Pages deployment workflow.
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
