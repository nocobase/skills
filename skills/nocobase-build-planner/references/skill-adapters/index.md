# Skill Adapters

Skill adapters tell `nocobase-build-planner` how to translate PRD slices into task files and prompts for each downstream skill.

Before generating a task group for a downstream skill:

1. Read that downstream skill's `SKILL.md`.
2. Read the matching adapter below.
3. Generate a single-skill locked task file and prompt.

## Adapter Index

| Downstream skill | Adapter |
| --- | --- |
| `nocobase-data-modeling` | [nocobase-data-modeling.md](nocobase-data-modeling.md) |
| `nocobase-ui-builder` | [nocobase-ui-builder.md](nocobase-ui-builder.md) |
| `nocobase-workflow-manage` | [nocobase-workflow-manage.md](nocobase-workflow-manage.md) |
| `nocobase-acl-manage` | [nocobase-acl-manage.md](nocobase-acl-manage.md) |
| `nocobase-data-analysis` | [nocobase-data-analysis.md](nocobase-data-analysis.md) |

## Universal Prompt Sections

Every prompt must include:

1. Skill lock
2. Source PRD path
3. Task file path
4. Goal
5. Scope
6. Inputs extracted from PRD
7. Execution boundaries
8. Acceptance checks
9. Evidence required
10. Expected output summary

## Universal Skill Lock Text

Use this wording, replacing the skill name:

```md
Skill lock:
Use only $<skill-name> for this task. Do not use other NocoBase skills, generic fallback commands, or unrelated tooling for this task. If another skill is needed, stop and report that a separate task group is required.
```
