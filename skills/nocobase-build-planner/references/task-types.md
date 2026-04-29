# Task Types

Use these task group IDs and task types.

## Standard Groups

| Group ID | Type | Skill | File |
| --- | --- | --- | --- |
| `TG-READINESS` | `readiness` | `bside-prd-planner` | `00-readiness.yaml` |
| `TG-DATA-MODELING` | `data_modeling` | `nocobase-data-modeling` | `01-data-modeling.yaml` |
| `TG-UI-BUILDER` | `ui_builder` | `nocobase-ui-builder` | `02-ui-builder.yaml` |
| `TG-WORKFLOW` | `workflow` | `nocobase-workflow-manage` | `03-workflow.yaml` |
| `TG-ACL` | `acl` | `nocobase-acl-manage` | `04-acl.yaml` |
| `TG-REPORTING` | `reporting` | `nocobase-ui-builder` / `nocobase-data-analysis` | `05-reporting.yaml` |
| `TG-ACCEPTANCE` | `acceptance` | later agent / manual verification | `06-acceptance.yaml` |

## Skill Lock

Every executable task group is locked to exactly one skill.

```yaml
skill_lock:
  enabled: true
  allowed_skill: nocobase-ui-builder
  disallowed_skills:
    - nocobase-data-modeling
    - nocobase-workflow-manage
    - nocobase-acl-manage
  rule: This task must use only the allowed skill. If another skill is needed, stop and request a separate task group.
```

If one PRD slice needs multiple skills, split it:

- collection fields -> `TG-DATA-MODELING`
- page blocks -> `TG-UI-BUILDER`
- lifecycle automation -> `TG-WORKFLOW`
- role/data permissions -> `TG-ACL`

Do not create mixed-skill task groups.

## Optional Groups

| Group ID pattern | Type | Skill |
| --- | --- | --- |
| `TG-PLUGIN-DEVELOPMENT-*` | `plugin_development` | `nocobase-plugin-development` |
| `TG-PLUGIN-MANAGE-*` | `plugin_manage` | `nocobase-plugin-manage` |
| `TG-ENV-*` | `env_manage` | `nocobase-env-manage` |
| `TG-PUBLISH-*` | `publish_manage` | `nocobase-publish-manage` |
| `TG-DATA-ANALYSIS-*` | `data_analysis` | `nocobase-data-analysis` |

## Risk Levels

- `low`: read-only planning, acceptance, or non-mutating analysis.
- `medium`: creates or updates collections/pages/workflows in a scoped app.
- `high`: ACL, publish, destructive changes, global settings, broad user access changes.

## Mutation Flag

Set `mutation: true` for task groups expected to change NocoBase state.

Set `mutation: false` for readiness checks, analysis-only, and acceptance-only tasks.

## Expected Outputs

Common `expected_outputs` values:

- `created_or_updated_resources`
- `reused_resources`
- `readback_summary`
- `verification_evidence`
- `unresolved_questions`
- `risk_notes`
- `next_task_inputs`
