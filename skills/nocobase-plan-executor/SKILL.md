---
name: nocobase-plan-executor
description: Execute an existing NocoBase PRD, BuildPlan, task list, or externally supplied implementation plan by dispatching each task to the right NocoBase build skill. Use when the user says to implement, execute, run, test, or continue a NocoBase plan that already exists, especially when work must proceed one task at a time with readback evidence and user acceptance before continuing. Do not use for generating a new plan from scratch; use the planning skill first.
---

# Goal

Execute an already-defined NocoBase build plan safely and visibly. This skill is the orchestrator: it does not replace domain skills such as data modeling, UI building, workflow management, ACL management, or testing.

It also guards plan-vs-live drift: before continuing a previously accepted plan, compare the last accepted baseline with the current live NocoBase state so user changes made in the UI are not silently overwritten.

# Scope

- Read an existing PRD, BuildPlan, task file, or user-provided task list.
- Normalize the plan into ordered execution tasks.
- Lock the target NocoBase environment before any mutation.
- Execute exactly one task slice at a time through the appropriate NocoBase skill.
- Reconcile last accepted baseline, current live state, and planned writes before each task.
- Read back evidence after each task.
- Stop after each task and ask the user to accept, reject, or request adjustment.
- Record progress, decisions, evidence, baselines, plan versions, and user acceptance in run artifacts when a project folder is available.

# Non-Goals

- Do not generate the initial plan from product requirements. Hand off plan creation to the build-planning skill.
- Do not bypass specialized skills with ad-hoc API calls when a relevant NocoBase skill exists.
- Do not silently continue from one task to the next after a mutation.
- Do not enable workflows, apply ACL permissions, delete data/pages, or grant broad access without explicit user confirmation.
- Do not clean up partial work after interruption unless the user asks.

# Required Inputs

| Input | Required | Default | Notes |
|---|---|---|---|
| `plan_source` | yes | none | File path, document path, pasted plan, or previously discussed plan. |
| `target_env` | yes for writes | none | Always use explicit `-e <env>` on `nb` commands. Never rely on default env. |
| `execution_scope` | no | next incomplete task | Accepts one task, next task, phase, or whole plan, but still pauses after each task. |
| `artifact_dir` | no | infer near plan | Used for `RunLog.md`, `AcceptanceReport.md`, and evidence files. |
| `resume_policy` | no | readback-first | On resume or interruption, inspect live state before deciding what remains. |
| `baseline_snapshot` | no | last accepted snapshot | Required for drift detection on previously executed surfaces. |

If `target_env` is missing and a write is requested, ask once for the environment before mutating.

# Dispatch Matrix

Use the minimal specialized skill set for the current task slice:

| Task Type | Dispatch To | Gate |
|---|---|---|
| Collections, fields, relations, seed-like schema setup | `nocobase-data-modeling` | readback collections and fields |
| Modern pages, menus, blocks, forms, tables, popups | `nocobase-ui-builder` | prepare-write before first write; readback routes/surface |
| Workflow drafts, nodes, revisions, execution diagnosis | `nocobase-workflow-manage` | create disabled; do not enable without confirmation |
| Roles, route permissions, data permissions, user-role assignment | `nocobase-acl-manage` | plan -> confirm -> apply -> readback |
| Runtime lifecycle and env checks | `nocobase-env-manage` | direct `nb` commands only |
| Functional validation and browser/QA checks | `nocobase-test` or browser/testing skill | report findings before fixes when requested |
| Documentation, run report, acceptance report | direct file edits with `apply_patch` | keep artifacts concise and factual |

# Hard Rules

1. Always lock the environment before writes. Every `nb` mutation and readback tied to the build must include explicit `-e <target_env>`.
2. Execute only one task slice at a time. A task slice should produce one coherent user-verifiable result, such as "create ticket collections" or "create customer submit page".
3. Before every mutating task, run the Live Reconcile Gate for that task type. If current live state differs from the last accepted baseline on paths the plan may touch, stop and resolve drift before writing.
4. Never silently overwrite UI, data model, workflow, ACL, or config changes made outside this executor. Preserve non-conflicting live changes by default.
5. Use three-way merge semantics: `baseline` = last accepted snapshot, `live` = current readback, `planned` = intended task output. If `live == baseline`, execute planned. If `live != baseline` and planned does not touch changed paths, merge by preserving live. If both touch the same path, stop for user choice.
6. Stop after each task slice. Report completion, evidence, known gaps, and exact acceptance options. Continue only after the user confirms.
7. On user rejection or requested changes, revise the current task slice first and update the run log before moving on.
8. Before any UI whole-page write, use `nocobase-ui-builder` and its prepare-write gate. Prefer localized edits on drifted live pages; use whole-page replace only when the user explicitly accepts overwrite.
9. For existing menu groups, use live `routeId` when required. Do not create duplicate same-title groups to avoid ambiguity.
10. Create workflow drafts disabled by default. Enabling, executing, or scheduling workflows requires explicit confirmation.
11. Treat ACL as high-risk. Never grant broad snippets, global role changes, or resource permissions without an explicit confirmation summary and readback.
12. After interruption, run readback first. Do not assume the last command fully failed or fully succeeded.
13. Do not delete, reset, or revert partial NocoBase work unless the user explicitly requests cleanup.

# Workflow

1. Load plan context.
- Read only the plan files needed for the requested scope.
- Confirm plan status, target environment, and the next task candidate.
- If the plan was externally supplied, infer task ordering from dependencies: env -> data model -> seed/config data -> UI -> workflows -> ACL -> acceptance tests.

2. Build a task ledger.
- Assign each task an id, title, type, dependencies, dispatch skill, expected result, and readback command.
- Mark tasks as `pending`, `in_progress`, `done`, `accepted`, `needs_adjustment`, `drift_detected`, or `blocked`.
- If artifacts are used, update `RunLog.md` after each task transition.

3. Reconcile the next task.
- Load the last accepted baseline snapshot for the task's target resources or surfaces.
- Read live state using the task-type readback method.
- Normalize task-specific facts and compare `baseline` vs `live`.
- Compare live drift paths against the planned write-set.
- If drift is non-conflicting, preserve live changes and execute a merged task.
- If drift conflicts, stop with adopt / overwrite / merge / pause options.

4. Preflight the next task.
- Verify target environment and CLI access.
- Verify dependencies from readback, not from memory.
- Announce the exact task slice about to run.

5. Execute through the specialized skill.
- Follow that skill's hard rules.
- Keep writes scoped to the current task.
- Prefer `--body-file` for JSON payloads in PowerShell.

6. Read back evidence.
- Use stable `nb` read commands for collections/routes/workflows/ACL records.
- Summarize only verified facts.
- Record generated IDs, names, route IDs, workflow IDs, and known limitations.
- Store the new accepted-candidate snapshot, but do not mark it as accepted until the user confirms.

7. Acceptance gate.
- Stop and report:
  - task completed
  - results achieved
  - evidence/readback
  - gaps or risks
  - proposed next task
- Ask the user to confirm acceptance or request adjustments.
- Do not continue to the next mutation until accepted.
- After acceptance, promote the candidate snapshot to the new baseline and, if drift was adopted or merged, record a new plan version.

# Reporting Format

After each task, use this shape:

```text
Task: <task id/title>
Status: done, awaiting acceptance
Environment: <target_env>
Results:
- <verified result>
- <verified result>
Evidence:
- <readback command or artifact path>
Gaps/Risks:
- <only if any>
Next:
- <next proposed task after acceptance>
```

# Artifact Policy

When the plan has a project documentation area, prefer:

- `RunLog.md`: chronological execution log with task status, commands/evidence summaries, and decisions.
- `AcceptanceReport.md`: acceptance cases, pass/fail state, and unresolved items.
- `PlanVersions.md` or `plan_versions/`: adopted live changes, merge decisions, and version notes.
- `baseline/`: last accepted normalized snapshots for relevant collections, pages, workflows, ACL records, and config data.
- `artifacts/` or `.tmp-*`: prepared JSON bodies, previews, and readback snapshots.

Keep artifacts factual. Do not mark a task accepted until the user confirms.

# Interruption And Resume

If the user interrupts a task or asks what happened:

1. Stop all further writes.
2. Read back the relevant live state using explicit `-e <target_env>`.
3. Compare live state with the task ledger.
4. Report partial successes and uncertain areas.
5. Ask whether to accept, adjust, continue, or pause.

# References

- [Execution Gates](references/execution-gates.md): use for task slicing, acceptance gate wording, interruption recovery, and artifact conventions.
- [Reconcile And Versioning](references/reconcile-and-versioning.md): use before every mutating task to detect UI/schema/workflow/ACL/config drift and decide merge strategy.
