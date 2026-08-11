---
name: nocobase-ai-employee
description: "Use when a NocoBase task requires AI employee lifecycle work such as discovering existing employees, judging fit, creating or maintaining a dedicated employee, and preparing it before another skill binds it to a UI surface."
argument-hint: "[action: decide|inspect|create|update|delete|verify|place] [employee?: username] [env?: name]"
allowed-tools: Bash, Read, Grep
owner: platform-tools
version: 2.0.0
last-reviewed: 2026-08-04
risk-level: high
---

# Goal

Configure the right AI employee for a NocoBase business surface and own its supported lifecycle safely. Decide whether the requirement should use built-in UI actions, JS actions, workflows, or an AI employee; then reuse, create, maintain, verify, and hand off the final UI placement to `nocobase-ui-builder`.

# Scope

- Decide whether a request needs an AI employee and select or create an appropriate non-developer employee.
- Inspect, create, update, enable, disable, verify, and safely delete supported AI employee records.
- Configure supported profile fields and dedicated chat-model restrictions.
- Prepare the public AI employee action contract and hand UI placement to `nocobase-ui-builder`.

# Non-Goals

- Do not configure LLM providers or saved services; use `nocobase-ai-manager`.
- Do not determine knowledge-base entitlement or create vector databases, knowledge bases, or documents; use `nocobase-ai-knowledge-base-manager`.
- Do not place actions by writing raw Flow Model or database rows; use `nocobase-ui-builder`.
- Do not expose developer employees on business or AI Portal surfaces.

## Required Hand-Off Skills

- Use `nocobase-ui-builder` for Modern page/block/action authoring and AI employee action placement.
- Use `nocobase-data-modeling` when the requirement needs new collections, fields, or relations before the AI action can work.
- Use `nocobase-workflow-manage` when the AI employee should call or trigger a workflow tool, or when the task is mostly deterministic backend automation.
- Use `nocobase-ai-manager` before creating or changing dedicated `modelSettings`.
- Use `nocobase-ai-knowledge-base-manager` when a request requires knowledge-base capability, resources, or binding preparation.

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
| --- | --- | --- | --- | --- |
| `action` | yes | `decide` | one of `decide/inspect/create/update/delete/verify/place` | "Which AI employee action should I perform?" |
| `env` | no | current environment from `nb env list` | configured, reachable, authenticated | "Which NocoBase environment should I target?" |
| `username` | record mutation: yes; decision/inspect: optional | none | exact stable username, uniquely resolved | "What is the exact employee username?" |
| `targetSurface` | placement: yes | none | exact page/block/action context | "Which UI surface should expose the employee?" |
| `changes` | create/update: yes | preserve unmentioned values | supported writable fields or a verified specialist handoff | "Which employee fields should change?" |
| `confirmation` | high-risk action: yes | none | fresh exact-target confirmation after impact is shown | "Confirm this exact availability, model, identity, or delete change?" |

Rules:

- If required input or dependency readiness is missing, stop mutation and ask clarification.
- If the user says "you decide", inspect and recommend reuse candidates only; do not create or mutate records.
- Never silently convert duplicate create into update or silently drop unsupported fields.

# Mandatory Clarification Gate

- Max clarification rounds: `2`; max questions per round: `3`.
- Before mutation, confirm environment, exact username, intended writable fields, enabled state, model references, and any specialist handoff.
- Model changes require a current readiness result from `nocobase-ai-manager`.
- Disabling, model changes, identity changes, and deletion require the impact and secondary-confirmation rules in the Safety Gate.

## Decision Gate

Classify the user request before writing anything:

| Need | Prefer |
| --- | --- |
| Fixed CRUD, navigation, visibility, filters, field assignment, or simple button behavior | Built-in UI action / reaction through `nocobase-ui-builder` |
| Deterministic client-side calculation, formatting, validation, or data transform | JS action / JS surface through `nocobase-ui-builder` |
| Deterministic multi-step server automation, approval, notification, scheduled work | Workflow through `nocobase-workflow-manage` |
| Natural-language interpretation, ambiguous intent, extraction from messy text, summarization, classification, drafting, recommendations, data insight narrative, tool choice, or model judgment | AI employee action |

Only choose AI employee when model judgment materially reduces ambiguity or gives the user a natural-language task surface. Do not use AI employee as a substitute for ordinary deterministic UI configuration.

# Workflow

1. **Decompose the request**
   - Identify the target page/block/action slot, target collection, current-record vs whole-block context, and expected user interaction.
   - Split deterministic setup from non-deterministic model work.
   - If the target UI surface is not uniquely known, use `nocobase-ui-builder` inspection routes first.

2. **Decide if AI employee is appropriate**
   - Apply the Decision Gate.
   - If AI is not appropriate, hand off to the relevant skill and explain the narrower route.
   - If AI is appropriate, write a compact task contract: employee role, input context, expected output, whether to auto-send, whether to use web search, and any required tools/skills.

3. **Discover existing AI employees**
   - Prefer user-visible employees with `aiEmployees:listByUser`.
   - For business and AI Portal surfaces, filter to `enabled=true`, `deprecated=false`, role-visible rows with `category!="developer"`. Reject known developer usernames `nathan`, `dara`, `lina`, and `orin` even when category metadata is missing or stale.
   - Match by role, position, bio, existing tools, and `modelSettings`.
   - Read `references/ai-employee-api.md` only when you need concrete resource names, fields, or payload shapes.

4. **Reuse or create**
   - Reuse an existing employee when one clearly covers the role with compatible tools and model restrictions.
   - Create a new employee only when no existing employee reaches roughly 70% fit, or when the user explicitly wants a dedicated employee.
   - For new employees, keep `bio` human-facing and put operational behavior in `about`.
   - For new employees, validate the create payload has `avatar` set to a supported avatar seed before calling `aiEmployees:create`.
   - If `avatar` is missing, empty, null, or unsupported, set it to the default supported seed `nocobase-015-male`.
   - Never create a developer-category employee for a business or AI Portal interaction.
   - When the operation uses `nb api ai employees`, follow [Employee Record Management](#employee-record-management); that narrower safe-field contract governs the record write.
5. **Bind the employee to the block**
   - Before binding, read the selected employee and refuse any `category="developer"` employee or known developer username. Developer employees belong only to their dedicated NocoBase builder/editor surfaces; do not add, expose, or select them for user-facing Portal interactions.
   - Use `nocobase-ui-builder` and its AI employee action reference.
   - Use public action shape only: `type: "aiEmployee"` with `settings.username`, `settings.auto`, `settings.workContext`, `settings.tasks`, `settings.style`.
   - Do not write raw `props`, `stepParams`, `flowModels`, or database rows.
   - For block/form/record context, default to `workContext: [{ "type": "flow-model", "target": "self" }]`.

6. **Verify**
   - Read back or inspect the target surface through `nocobase-ui-builder` when a write occurred.
   - Verify the AI action points at the intended non-developer username and has the intended task message.
   - If a new employee was created, verify it appears in `aiEmployees:listByUser` for the intended role, and verify its `avatar` is non-empty and still one of the supported avatar seeds. Explain any role/ACL follow-up if it is not visible.

## Employee Matching Rules

Prefer business built-ins when they fit:

- `atlas`: route a broad request to other employees or coordinate sub-agents.
- `dex`: extract, clean, structure, or fill forms from messy text.
- `viz`: analyze data and produce insights or reports.
- `ellis`: understand, summarize, and draft email replies.
- `lexi`: translation and localization for business users.

Never use a developer employee in a business or AI Portal surface. This includes any employee with `category="developer"` and the known usernames `nathan`, `dara`, `lina`, and `orin`. Create a dedicated business employee when the task needs domain-specific behavior, a constrained model set, dedicated custom workflow tools, or a role/persona that should be exposed to business users.

## Avatar Payload Rules

- `avatar` is a preset seed string, not an uploaded file object or external image URL.
- Default seed: `nocobase-015-male`.
- Every new `aiEmployees:create` payload must include `avatar`.
- Before create, validate `avatar` against the supported seeds below. Replace missing, empty, null, or unsupported values with `nocobase-015-male`.
- After create, read back the employee through `aiEmployees:list` or `aiEmployees:listByUser` and verify `avatar` is present.

Supported avatar seeds:

```text
nocobase-001-male
nocobase-002-male
nocobase-003-female
nocobase-004-male
nocobase-005-female
nocobase-006-male
nocobase-007-male
nocobase-008-female
nocobase-009-female
nocobase-010-male
nocobase-011-male
nocobase-012-male
nocobase-013-female
nocobase-014-female
nocobase-015-male
nocobase-016-female
nocobase-017-female
nocobase-018-female
nocobase-019-female
nocobase-020-female
nocobase-021-male
nocobase-022-male
nocobase-023-female
nocobase-024-male
nocobase-025-male
nocobase-026-male
nocobase-027-female
nocobase-028-male
nocobase-029-male
nocobase-030-male
nocobase-031-female
nocobase-032-male
nocobase-033-male
nocobase-034-female
nocobase-035-male
nocobase-036-female
nocobase-037-male
nocobase-038-female
nocobase-039-female
nocobase-040-female
nocobase-041-male
nocobase-042-male
nocobase-043-male
nocobase-044-male
nocobase-045-female
nocobase-046-female
nocobase-047-male
nocobase-048-female
nocobase-049-male
nocobase-050-female
nocobase-051-female
nocobase-052-female
nocobase-053-male
nocobase-054-female
nocobase-055-male
nocobase-056-female
nocobase-057-female
nocobase-058-female
nocobase-059-male
nocobase-060-female
```

## Task Contract Template

Use this internal template before placement:

```json
{
  "intent": "what the user wants",
  "targetSurface": "page/block/action slot",
  "decision": "builtin|js|workflow|ai-employee",
  "employee": {
    "mode": "reuse|create",
    "username": "candidate-or-new-username",
    "role": "short business role",
    "reason": "why this employee fits"
  },
  "aiAction": {
    "auto": false,
    "autoSend": false,
    "context": "self|named block|record",
    "taskTitle": "short button/task title",
    "systemMessage": "stable operational constraints",
    "userMessage": "what the employee should do with the block context",
    "webSearch": false
  }
}
```

# Employee Record Management

> [!IMPORTANT]
The former `nocobase-ai-employee-manager` skill has been removed and deprecated. All supported employee record operations now use `nocobase-ai-employee`.

This chapter supplements—but does not replace—the decision, employee matching, avatar, action-contract, and UI-placement workflow above. Keep operational details in the bundled references rather than expanding this main file.

## Record Management Rules

- Before using `nb api ai employees`, read [employee-command-map.md](references/employee-command-map.md), [employee-record-fields.md](references/employee-record-fields.md), and [employee-record-workflows.md](references/employee-record-workflows.md).
- Resolve one exact stable `username`; prove absence before create and never mutate identity after creation.
- Write only fields supported by the selected API surface, preserve unmentioned fields, and reject protected fields rather than silently dropping them.
- Run `nocobase-ai-manager` only when dedicated `modelSettings` are created or changed.
- For any knowledge-base intent, use `nocobase-ai-knowledge-base-manager` for capability, resource, and binding preparation; this skill applies only the verified employee-field handoff and does not duplicate KB rules.
- Read back every create/update. Never delete a built-in employee, and require fresh exact-target confirmation before deleting a custom employee.
- Follow [employee-record-workflows.md](references/employee-record-workflows.md) for execution order, idempotency, confirmation, rollback, and failure handling.


# Reference Loading Map

| Reference | Use When | Notes |
| --- | --- | --- |
| [AI employee API](references/ai-employee-api.md) | Selecting employees or using confirmed resource actions outside the narrow CLI record surface. | Core fields, prompt semantics, and creation guidance. |
| [Block action payload](references/block-action-payload.md) | Preparing a Modern UI AI employee action. | Public action shape and placement handoff. |
| [Examples](references/examples.md) | Classifying AI versus deterministic behavior or drafting task text. | Reusable decisions and payloads. |
| [Employee command map](references/employee-command-map.md) | Inspecting or mutating records through `nb api ai employees`. | Supported CRUD, prerequisites, and exclusions. |
| [Employee record fields](references/employee-record-fields.md) | Building employee record payloads. | Writable fields, defaults, and protected fields. |
| [Employee record workflows](references/employee-record-workflows.md) | Creating, updating, disabling, deleting, verifying, or rolling back. | Idempotency and safety sequence. |

# Safety Gate

High-impact actions include changing identity, disabling a business employee, changing dedicated model settings, and deleting a custom employee. Never write protected internal fields or delete a built-in employee.

Secondary confirmation template:

- "Confirm execution: `<action>` on AI employee `<username>` in `<env>`. Expected impact: `<availability/model/identity impact>`. Type `confirm` to continue."

Rollback guidance lives in [employee-record-workflows.md](references/employee-record-workflows.md). Never auto-delete a new employee after verification failure, and treat timeout/5xx write state as unknown until readback.

# Verification Checklist

- The target environment and employee command/resource surface are verified.
- The username is absent for create or uniquely resolved for other actions.
- The selected employee is non-developer for business or AI Portal placement.
- Create payloads contain a supported avatar.
- Payloads contain only fields writable through the selected surface.
- Every create/update has independent safe-field readback.
- Built-in employees are never deleted or identity-mutated.
- Required confirmations, allowed cases, denied cases, errors, and partial success are reported separately.

# Minimal Test Scenarios

1. Happy path: inspect and reuse an existing employee without unnecessary prerequisite work.
2. Happy path: create or update a custom employee and verify it by readback.
3. Missing required input or invalid protected fields block mutation.
4. Auth or permission failure stops execution with recovery guidance.
5. Denied case: refuse built-in deletion; custom deletion requires fresh confirmation and absence verification.

# Output Contract

Final responses must identify the environment, action, exact username, safe commands executed, defaults applied, prerequisite or specialist handoffs used, readback evidence, confirmations, rollback limits, partial success, and remaining UI work.

# References

- [NocoBase AI employee documentation](https://docs.nocobase.com/ai-employees/): use when checking current product behavior. [verified: 2026-08-04]
- [AI employee API](references/ai-employee-api.md): use for employee fields, prompt semantics, and confirmed resource actions.
- [Block action payload](references/block-action-payload.md): use for the public UI action contract.
- [Examples](references/examples.md): use for classification and task examples.
- [Employee command map](references/employee-command-map.md): use for supported `nb api ai employees` commands and exclusions.
- [Employee record fields](references/employee-record-fields.md): use for safe-field schemas, model restrictions, defaults, and protected fields.
- [Employee record workflows](references/employee-record-workflows.md): use for CRUD, verification, rollback, and delete safety.
