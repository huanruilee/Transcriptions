# START HERE — Transcriptions Project Agent Entrance & Governance Guide

- Project ID: TRANSCRIPTIONS-CORE-001
- Authority Owner: Henry Lee
- Primary Agent Operator: 小法 (gx10 Agent)
- Governance Authority: gx10-governance (GGF v1.1 / GGF v2.0 Baseline)
- Primary Repository: https://github.com/huanruilee/Transcriptions

---

## 1. Objective & Scope

This repository hosts the **Transcriptions Multi-Media Learning Platform** for series courses, with *入中論善顯密意疏* (Illumination of the Thought of Madhyamakavatara) as the primary benchmark course.

The platform provides readers with an interactive experience to listen to audio, read formatted transcripts, view structural TOCs (科判), search terminology, and take notes.

---

## 2. GGF Operating Principles for Agent (小法)

When operating on this repository, **小法 (gx10 Agent)** MUST adhere to the following 5 GGF principles:

1. **Evidence First (證據優先)**:
   Never declare a task complete without empirical test evidence. Always run `npm test` before committing changes.
2. **Policy Before Prompt (規範先於 Prompt)**:
   Read `docs/SPECIFICATION.md` and `docs/DATA_SCHEMA.md` as the single source of truth. Do not infer schema or contract logic.
3. **Governance Above Agents (治理高於 Agent)**:
   Follow `docs/AGENT_GUIDELINES.md` for task intake, branching, and commit message formats.
4. **Review Produces Verdict; Only Henry Produces Decision (審查與決策分離)**:
   Agent execution and test runs produce a Verdict. Breaking changes to schemas or core APIs are **Henry Reserved Decisions** requiring explicit user confirmation.
5. **Program Management (階層式計畫管理)**:
   Track work in `docs/TASKS.md` following `Project -> Milestone (Phase) -> Task`.

---

## 3. Required Reading Order for Agent (小法)

When 小法 initializes or starts a working session on this repository, read the files in the following order:

1. `START_HERE.md` (this file)
2. `docs/AGENT_GUIDELINES.md` (Agent SOP & Commit Rules)
3. `docs/SPECIFICATION.md` (4 Core Feature Requirements & UI Specs)
4. `docs/DATA_SCHEMA.md` (JSON Schema Specifications)
5. `docs/TASKS.md` (Active Task Backlog & Progress Tracker)
6. `courses/入中論善顯密意疏/course.json` (Sample Course Meta)

---

## 4. Agent Intake & Execution Protocol (SOP)

```text
Intake Step 1: Read START_HERE.md and docs/TASKS.md
Intake Step 2: Pick next uncompleted task [ ] from docs/TASKS.md
Intake Step 3: Read corresponding section in docs/SPECIFICATION.md & DATA_SCHEMA.md
Intake Step 4: Write/modify code in src/ or courses/
Intake Step 5: Write unit/integration tests in tests/
Intake Step 6: Run `npm test` -> Verify 0 errors (Generate Evidence)
Intake Step 7: Update docs/TASKS.md to mark task as [x] Completed
Intake Step 8: Commit & Push with semantic commit message: `feat:`, `fix:`, `docs:`, `test:`
```

---

## 5. Henry Reserved Decisions (需要 Henry 明確授權的事項)

The Agent MUST NOT perform the following without explicit Henry authorization:
- Modifying core JSON Schema formats in `docs/DATA_SCHEMA.md` that break backward compatibility.
- Deleting existing course content files under `courses/`.
- Changing git remote origins or force-pushing to `main`.
