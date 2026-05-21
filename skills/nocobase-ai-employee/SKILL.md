---
name: nocobase-ai-employee
description: >-
  Use when a NocoBase task requires AI employee lifecycle work such as
  discovering existing employees, judging fit, creating a dedicated employee,
  or configuring profile, prompt, model, skills, tools, or knowledge base
  before another skill binds it to a UI surface.
---

# NocoBase AI Employee

## Goal

Configure an AI employee-backed action for a specific NocoBase business surface. Decide whether the requirement should use built-in UI actions, JS actions, workflows, or an AI employee; then reuse or create the right employee and hand off the final UI placement to `nocobase-ui-builder`.

## Required Hand-Off Skills

- Use `nocobase-ui-builder` for Modern page/block/action authoring and AI employee action placement.
- Use `nocobase-data-modeling` when the requirement needs new collections, fields, or relations before the AI action can work.
- Use `nocobase-workflow-manage` when the AI employee should call or trigger a workflow tool, or when the task is mostly deterministic backend automation.

## Decision Gate

Classify the user request before writing anything:

| Need | Prefer |
| --- | --- |
| Fixed CRUD, navigation, visibility, filters, field assignment, or simple button behavior | Built-in UI action / reaction through `nocobase-ui-builder` |
| Deterministic client-side calculation, formatting, validation, or data transform | JS action / JS surface through `nocobase-ui-builder` |
| Deterministic multi-step server automation, approval, notification, scheduled work | Workflow through `nocobase-workflow-manage` |
| Natural-language interpretation, ambiguous intent, extraction from messy text, summarization, classification, drafting, recommendations, data insight narrative, tool choice, or model judgment | AI employee action |

Only choose AI employee when model judgment materially reduces ambiguity or gives the user a natural-language task surface. Do not use AI employee as a substitute for ordinary deterministic UI configuration.

## Workflow

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
   - If using admin list data, filter to `enabled=true`, `deprecated=false`, and role-visible rows. Avoid `category="developer"` unless the user is configuring developer-facing builder work.
   - Match by role, position, bio, existing tools, and `modelSettings`.
   - Read `references/ai-employee-api.md` only when you need concrete resource names, fields, or payload shapes.

4. **Reuse or create**
   - Reuse an existing employee when one clearly covers the role with compatible tools and model restrictions.
   - Create a new employee only when no existing employee reaches roughly 70% fit, or when the user explicitly wants a dedicated employee.
   - For new employees, keep `bio` human-facing and put operational behavior in `about`.
   - Do not create developer-category employees for business users unless explicitly requested.

5. **Bind the employee to the block**
   - Use `nocobase-ui-builder` and its AI employee action reference.
   - Use public action shape only: `type: "aiEmployee"` with `settings.username`, `settings.auto`, `settings.workContext`, `settings.tasks`, `settings.style`.
   - Do not write raw `props`, `stepParams`, `flowModels`, or database rows.
   - For block/form/record context, default to `workContext: [{ "type": "flow-model", "target": "self" }]`.

6. **Verify**
   - Read back or inspect the target surface through `nocobase-ui-builder` when a write occurred.
   - Verify the AI action points at the intended username and has the intended task message.
   - If a new employee was created, verify it appears in `aiEmployees:listByUser` for the intended role, or explain any role/ACL follow-up needed.

## Employee Matching Rules

Prefer built-ins when they fit:

- `atlas`: route a broad request to other employees or coordinate sub-agents.
- `dex`: extract, clean, structure, or fill forms from messy text.
- `viz`: analyze data and produce insights or reports.
- `ellis`: understand, summarize, and draft email replies.
- `lexi` / `lina`: translation and localization, with `lina` usually developer-facing.
- `nathan`: frontend code authoring or JS/code-editor work; developer-facing.

Create a dedicated employee when the task needs domain-specific behavior, a constrained model set, dedicated custom workflow tools, or a role/persona that should be exposed to business users.

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

## References

- Read `references/ai-employee-api.md` for collections, resource actions, field meanings, and create/update payload notes.
- Read `references/block-action-payload.md` for the public AI employee action shape and placement rules.
- Read `references/examples.md` for reusable classification and payload examples.
