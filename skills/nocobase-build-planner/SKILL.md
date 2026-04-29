---
name: nocobase-build-planner
description: Compile an approved AI-build-ready PRD.yaml into a multi-file, agent-executable NocoBase BuildPlan Package. Use after bside-prd-planner when users want to turn PRD requirements into ordered tasks for NocoBase building. Produces BuildPlan.yaml/BuildPlan.md plus one task file and one prompt file per downstream skill such as nocobase-data-modeling, nocobase-ui-builder, nocobase-workflow-manage, and nocobase-acl-manage. Does not execute tasks or mutate NocoBase.
---

# Goal

Compile `PRD.yaml` into a multi-file BuildPlan Package that another agent can execute without guessing which skill to use or what to ask that skill to do.

This skill produces a plan package only. It does not call downstream skills, run `nb`, modify NocoBase, or approve PRD decisions.

# Inputs

Preferred input:

```text
nocobase_docs/prds/<system-slug>/PRD.yaml
```

If the user only names a system, look for:

```text
nocobase_docs/prds/<system-slug>/PRD.yaml
```

If multiple PRDs match, ask the user to choose. If no PRD is found, direct the user to `bside-prd-planner`.

# Artifact Policy

Generated BuildPlan files belong to the current agent workspace.

Default output layout:

```text
nocobase_docs/build_plans/<system-slug>/
  BuildPlan.yaml
  BuildPlan.md
  tasks/
    00-readiness.yaml
    01-data-modeling.yaml
    02-ui-builder.yaml
    03-workflow.yaml
    04-acl.yaml
    05-reporting.yaml
    06-acceptance.yaml
  prompts/
    00-resolve-prd-blockers.md
    01-data-modeling.md
    02-ui-builder.md
    03-workflow.md
    04-acl.md
    05-reporting.md
    06-acceptance.md
  versions/
    <prd-version>/
      BuildPlan.yaml
      BuildPlan.md
      tasks/
      prompts/
```

Only generate task/prompt files that are relevant. For a blocked PRD, generate only readiness files and blocker-resolution prompt.

After writing files, tell the user the exact paths of `BuildPlan.yaml` and `BuildPlan.md`.

# Workflow

## 1. Read And Validate PRD

Read `PRD.yaml` and inspect:

- `prd.id`, `prd.name`, `prd.version`, `prd.status`
- `build_readiness.status`
- `open_questions`
- `roles`
- `requirements`
- `business_objects`
- `processes`
- `pages`
- `permissions`
- `metrics`
- `acceptance_tests`
- `traceability`

Always read [BuildPlan Package Schema](references/build-plan-package-schema.md) before writing output.

## 2. Apply Readiness Gate

Use [Readiness Gate](references/readiness-gate.md).

- If PRD is `blocked`, produce a blocked BuildPlan Package with `tasks/00-readiness.yaml` and `prompts/00-resolve-prd-blockers.md`; do not generate execution task files.
- If PRD is `partial`, produce a `needs_review` BuildPlan Package with warnings and task files only when defaults make execution unambiguous.
- If PRD is `approved` and `build_readiness.status=ready`, produce a `ready_for_agent` BuildPlan Package.

Never silently convert blocked PRD assumptions into executable tasks.

## 3. Compile Task Groups

Use [PRD To Task Mapping](references/prd-to-task-mapping.md) and [Task Types](references/task-types.md).

Map:

- `business_objects` -> `nocobase-data-modeling`
- `pages` -> `nocobase-ui-builder`
- `processes` -> `nocobase-workflow-manage`
- `permissions` -> `nocobase-acl-manage`
- `metrics` -> `nocobase-ui-builder` and optionally `nocobase-data-analysis`
- `acceptance_tests` -> acceptance task file and prompt
- plugin gaps -> `nocobase-plugin-development` / `nocobase-plugin-manage`
- environment or release scope -> `nocobase-env-manage` / `nocobase-publish-manage`

Before generating a task/prompt for a downstream skill, read:

1. that downstream skill's own `SKILL.md`
2. the matching adapter in [Skill Adapters](references/skill-adapters/index.md)

This ensures the generated prompt matches the target skill's real scope, hard rules, input expectations, and verification style.

## 4. Generate Prompt Files

Each downstream skill must get a dedicated prompt file in `prompts/`.

The prompt must include:

- skill name to use
- source PRD path
- task file path
- business goal
- source PRD IDs
- target tasks
- execution boundaries
- acceptance checks
- evidence required
- a skill lock statement saying this task must use only the named skill and must not borrow capabilities from other skills

Do not include raw `nb` commands. The downstream skill owns command discovery and execution details.

## 5. Generate Root Index

`BuildPlan.yaml` is the root orchestration index. It must contain:

- source PRD metadata and path
- readiness gate result
- execution policy
- task group index
- dependency graph
- execution order
- traceability summary

It should not duplicate every task detail. Detailed task content belongs in `tasks/*.yaml`; executable instructions belong in `prompts/*.md`.

# Hard Rules

1. Do not execute tasks.
2. Do not call downstream NocoBase skills.
3. Do not run `nb` commands.
4. Do not generate executable task groups when `build_readiness.status=blocked`.
5. Every task group must have both a task file and prompt file.
6. Every task group must list `source_prd_items`, `depends_on`, `acceptance`, and `evidence_required`.
7. Prompt files must be specific enough for an agent to use directly with the named skill.
8. Preserve traceability from task group -> PRD items -> acceptance tests.
9. Never write BuildPlan files into the skill installation directory.
10. Every executable task group must be locked to exactly one downstream skill. Its prompt must explicitly prohibit using other skills for that task.
11. If a PRD slice needs multiple skills, split it into multiple task groups instead of producing one mixed-skill task.

# Output Contract

Final response must include:

- BuildPlan status: `blocked`, `needs_review`, or `ready_for_agent`
- exact `BuildPlan.yaml` path
- exact `BuildPlan.md` path
- generated task groups
- blockers or warnings, if any
- next action

# References

- [BuildPlan Package Schema](references/build-plan-package-schema.md)
- [Readiness Gate](references/readiness-gate.md)
- [PRD To Task Mapping](references/prd-to-task-mapping.md)
- [Task Types](references/task-types.md)
- [Skill Adapters](references/skill-adapters/index.md)
