---
name: bside-prd-planner
description: Create AI-build-ready Chinese B-side PRD packages from one-line or rough enterprise system requests before NocoBase AI building. Use when users ask for a PRD, requirements clarification, industry MVP, or an auditable versioned PRD for systems such as 工单系统, CRM, ERP, 订单管理, OA, or other B-side business systems. Produces a human-readable PRD plus machine-readable PRD.yaml with version, assumptions, open questions, traceability, and build readiness.
---

# Goal

Turn a rough B-side system idea into a versioned, auditable PRD Package that can be reviewed by humans and later consumed by a NocoBase build planner.

The PRD Package has two views:

- `PRD.md`: human-readable B-side PRD for review.
- `PRD.yaml`: machine-readable requirement representation for downstream AI build planning.

This skill stops at PRD. It does not create NocoBase data models, pages, workflows, ACL policies, plugins, or deployments.

# Artifact Policy

Generated PRD files belong to the user's current agent workspace, not to the globally installed skill directory.

Use this output location policy:

1. If the user specifies an output directory, write there.
2. Otherwise write under the current workspace: `nocobase_docs/prds/<system-slug>/`.
3. Keep the latest editable files at:
   - `nocobase_docs/prds/<system-slug>/PRD.md`
   - `nocobase_docs/prds/<system-slug>/PRD.yaml`
4. Keep version snapshots under:
   - `nocobase_docs/prds/<system-slug>/versions/<version>/PRD.md`
   - `nocobase_docs/prds/<system-slug>/versions/<version>/PRD.yaml`
5. After writing files, tell the user the exact paths of both `PRD.md` and `PRD.yaml`.

Never write generated PRDs into the skill installation directory.

# Core Ideas

1. Start from an industry archetype when the user gives a short request such as "我想要一个工单系统".
2. Use the archetype to produce a reasonable MVP first, then ask only shape-changing questions.
3. Distinguish user facts from archetype defaults and AI assumptions.
4. Version every PRD output and keep a change log.
5. Mark build readiness explicitly. Downstream build planning should only continue when the PRD is approved and has no build-blocking open questions.

# When The Request Is Short

For one-line or vague requests:

1. Infer product classification:
   - commercial product or internal enterprise system
   - business management, tool, transaction platform, or infrastructure service
   - known archetype, such as `ticketing`
2. Present the inference briefly and proceed with the best matching archetype unless the user asks to correct it.
3. Generate a PRD v0.1 draft from the archetype MVP.
4. Ask at most 5 critical questions that change data model, process, permissions, or pages.
5. If the user says "你来定" or similar, apply archetype defaults and mark them as `archetype_default` or `ai_assumption`.

# Workflow

## 1. Classify And Route

Read the user's input and classify the system.

- If the request matches 工单 / ticket / service desk / IT 报修 / 售后服务 / 运维派单, read [Ticketing Archetype](references/archetypes/ticketing.md).
- If no archetype matches, use a generic B-side PRD structure and mark `archetype: generic_bside`.
- Always read [PRD Package Schema](references/prd-package-schema.md) before producing the final package shape.

## 2. Create The Initial PRD Package

Generate a first version with:

- version `0.1.0`
- status `draft` or `needs_review`
- source trace for every important item
- open questions for unresolved decisions
- build readiness status

Use these source tags:

- `user_explicit`: user clearly provided this fact.
- `archetype_default`: taken from a built-in archetype.
- `ai_assumption`: inferred by the AI from incomplete context.
- `derived`: derived from another confirmed item.

Use these confirmation states:

- `confirmed`
- `pending_confirmation`
- `rejected`

## 3. Ask Only Critical Questions

Ask questions only when they affect:

- system scope
- core roles
- data model shape
- workflow/state machine
- permission/data scope
- automation/integration
- MVP page set

Do not ask low-level implementation questions such as exact NocoBase field interfaces, CLI flags, table names, or UI component model names.

## 4. Revise And Version

When the user answers questions, update the PRD version:

- `0.1.0`: first inferred draft from a short or rough request.
- `0.2.0`, `0.3.0`: user answers, scope changes, or review revisions before approval.
- `1.0.0`: explicitly approved baseline PRD.
- `1.1.0`: later additive requirement change.
- `1.1.1`: wording or non-behavioral clarification.
- `2.0.0`: breaking process/model change after approval.

Never mark `status: approved` unless the user explicitly confirms the PRD can enter build planning.

## 5. Produce Build Readiness

Set:

- `ready`: approved, no build-blocking open questions, core objects/process/pages/permissions/acceptance tests present.
- `partial`: useful PRD exists but one or more non-blocking details remain.
- `blocked`: build planning would require guessing a core business choice.

# Hard Rules

1. Do not fabricate hard business facts such as volumes, team sizes, SLA hours, budgets, dates, or system names. Mark missing facts as assumptions or questions.
2. Every requirement, role, object, process, page, permission, metric, and acceptance test must have a stable ID.
3. Every important item must carry `source`, `confirmation`, and `introduced_in`.
4. Use archetype defaults to create momentum, but make defaults visible and reviewable.
5. Keep human PRD and machine YAML consistent. If they conflict, the structured YAML is the downstream source of truth and must be corrected.
6. Do not call NocoBase execution skills from this skill.
7. Do not produce a NocoBase BuildPlan here. Hand that to the later build-planner skill after PRD approval.

# Output Contract

If the user asks for files, create both:

- `PRD.md`
- `PRD.yaml`

Use the [Artifact Policy](#artifact-policy) for file locations and report the final paths to the user.

If the user asks inline, output:

1. classification result
2. short MVP summary
3. critical questions or applied defaults
4. PRD version/status/readiness
5. the machine-readable `PRD.yaml` or a concise excerpt when the full document would be too long

For approved PRDs, include a final handoff note:

```text
This PRD is approved for build planning: version=<version>, readiness=ready.
```

# References

- [PRD Package Schema](references/prd-package-schema.md): required output shape, ID conventions, versioning, readiness gate.
- [Ticketing Archetype](references/archetypes/ticketing.md): MVP defaults and critical questions for 工单系统.
