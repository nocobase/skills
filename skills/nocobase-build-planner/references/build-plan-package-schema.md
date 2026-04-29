# BuildPlan Package Schema

The BuildPlan Package is a multi-file agent-executable plan. It is generated from `PRD.yaml` and consumed by a later agent session or user-driven execution flow.

It does not execute anything by itself.

## File Layout

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

Only generate files that apply to the PRD and readiness state.

## Root BuildPlan.yaml

`BuildPlan.yaml` is the root orchestration index. Keep detailed task content out of it.

```yaml
schema_version: 1
build_plan:
  id: BP-TICKETING-001
  name: 工单系统 NocoBase 搭建计划
  version: 0.1.0
  status: blocked
  generated_at: 2026-04-28
  target_platform: nocobase
  source_prd:
    id: PRD-TICKETING-001
    name: 工单系统
    version: 0.1.0
    status: needs_review
    path: nocobase_docs/prds/ticketing/PRD.yaml

readiness_gate:
  accepted: false
  prd_status: needs_review
  prd_build_readiness: blocked
  blockers:
    - Q-USER-SCOPE
  warnings: []

execution_policy:
  executor: agent
  execute_tasks_in_order: true
  require_user_confirmation_before_mutation: true
  stop_on_failed_task: true
  run_log_path: nocobase_docs/build_runs/ticketing/RunLog.md
  acceptance_report_path: nocobase_docs/build_runs/ticketing/AcceptanceReport.md

task_groups: []
execution_order: []
traceability: []

recommended_next_action:
  skill: bside-prd-planner
  task_file: tasks/00-readiness.yaml
  prompt_file: prompts/00-resolve-prd-blockers.md
```

Allowed `build_plan.status` values:

- `blocked`: PRD is not buildable.
- `needs_review`: plan is generated but warnings/defaults need review before execution.
- `ready_for_agent`: plan can be handed to an agent for execution after user confirmation.
- `superseded`: replaced by a newer PRD or BuildPlan.

## BuildPlan.md

`BuildPlan.md` is a human-readable summary. Include:

- source PRD
- readiness gate result
- task group table
- dependency graph or ordered list
- blockers/warnings
- instructions for the next agent

## Readiness Task

Always generate `tasks/00-readiness.yaml`.

```yaml
task_group:
  id: TG-READINESS
  title: PRD readiness gate
  skill: bside-prd-planner
  status: blocked
  mutation: false
  risk_level: low

source_prd:
  path: nocobase_docs/prds/ticketing/PRD.yaml
  id: PRD-TICKETING-001
  version: 0.1.0

gate_result:
  accepted: false
  blockers:
    - id: Q-USER-SCOPE
      question: 这个工单系统是仅内部员工使用，还是外部客户也会提交工单？
      reason: 影响角色、页面、权限和数据隔离
  warnings: []

acceptance:
  - 阻塞问题得到用户确认
  - PRD.yaml 更新到非 blocked readiness

evidence_required:
  - updated_prd_yaml
  - updated_prd_change_log
```

## Skill Task File Shape

Each task file in `tasks/` must use this shape:

```yaml
task_group:
  id: TG-DATA-MODELING
  title: 数据模型搭建任务
  skill: nocobase-data-modeling
  skill_lock:
    enabled: true
    allowed_skill: nocobase-data-modeling
    disallowed_skills:
      - nocobase-ui-builder
      - nocobase-workflow-manage
      - nocobase-acl-manage
    rule: This task must use only the allowed skill. If another skill is needed, stop and request a separate task group.
  status: planned
  mutation: true
  risk_level: medium
  depends_on: []
  prompt_file: ../prompts/01-data-modeling.md

source_prd:
  path: nocobase_docs/prds/ticketing/PRD.yaml
  id: PRD-TICKETING-001
  version: 1.0.0

source_prd_items:
  requirements: []
  roles: []
  objects: []
  processes: []
  pages: []
  permissions: []
  metrics: []
  acceptance_tests: []

tasks:
  - id: TASK-MODEL-001
    title: 创建或复用工单核心对象
    description: 创建或复用工单、工单分类、处理记录和满意度评价对象
    source_prd_items:
      - OBJ-TICKET
      - OBJ-TICKET-CATEGORY
    inputs: {}
    acceptance: []
    evidence_required: []

acceptance: []
evidence_required: []
expected_outputs: []
```

## Prompt File Shape

Each prompt file in `prompts/` must be directly usable by a later agent.

```md
Use $nocobase-data-modeling to complete the data modeling task.

Skill lock:
Use only $nocobase-data-modeling for this task. Do not use UI builder, workflow, ACL, plugin, env, publish, or generic fallback skills. If the task requires another skill, stop and report that a separate task group is required.

Source PRD:
nocobase_docs/prds/ticketing/PRD.yaml

Task file:
nocobase_docs/build_plans/ticketing/tasks/01-data-modeling.yaml

Goal:
...

Scope:
...

Requirements:
...

Execution boundaries:
- Do not implement pages.
- Do not configure ACL.
- Follow the target skill's own readback and verification rules.

Acceptance:
...

Evidence required:
...
```

Write prompts in the user's working language. For Chinese PRDs, prompts should be Chinese, while keeping skill names and file paths exact.

## Version Snapshots

After generating the current package, copy the same files to:

```text
versions/<prd-version>/
```

Do not overwrite older version snapshots unless the user explicitly asks to regenerate that version.
