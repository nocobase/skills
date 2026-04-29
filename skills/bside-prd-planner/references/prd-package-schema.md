# PRD Package Schema

Use this schema for every AI-build-ready B-side PRD package.

The PRD has two synchronized forms:

- `PRD.md`: human-readable review document.
- `PRD.yaml`: machine-readable source for downstream build planning.

## File Location

Generated PRD files should be written to the user's current agent workspace unless the user specifies another output directory.

Default layout:

```text
nocobase_docs/prds/<system-slug>/
  PRD.md
  PRD.yaml
  versions/
    <version>/
      PRD.md
      PRD.yaml
```

The latest editable files are the root `PRD.md` and `PRD.yaml`. Version directories are immutable snapshots for review and traceability.

After writing files, always tell the user the exact paths.

## Human PRD Outline

Use this 14-chapter outline for `PRD.md` unless the user asks for a lighter version.

```md
# {System Name} PRD

| Field | Value |
| --- | --- |
| PRD ID | {prd.id} |
| Version | {prd.version} |
| Status | {prd.status} |
| Product Classification | {classification} |
| Archetype | {archetype} |
| Author | AI generated, user reviewed |
| Submitted Date | {date} |

## PRD Change Log

| Version | Date | Change | Source | Reviewer |
| --- | --- | --- | --- | --- |

## 1. Project Background
## 2. Requirement Basics
## 3. Business Analysis
## 4. Benefit Goals
## 5. Solution Overview
## 6. Project Scope
## 7. Project Risks
## 8. Terms
## 9. References
## 10. Functional Requirements
## 11. Metrics And Tracking
## 12. Roles And Permissions
## 13. Operation Plan
## 14. Open Decisions

## Appendix A. Machine-Readable PRD Summary
## Appendix B. Traceability Matrix
```

For B-side business management systems, chapter 10 must include:

- business object list
- ER-style model summary
- core process flow
- state machine when records have lifecycle states
- module/page requirements
- business rules
- exception handling

Use Mermaid in `PRD.md` when diagrams help review, but do not rely on Mermaid as the only machine-readable representation.

## Machine PRD Top-Level Shape

```yaml
schema_version: 1
prd:
  id: PRD-TICKETING-001
  name: 工单系统
  version: 0.1.0
  status: draft
  created_from: 我想要一个工单系统
  language: zh-CN
  product_classification:
    business_attribute: enterprise_internal
    functional_type: business_management
  archetype:
    id: ticketing
    version: 0.1.0
  target_platform:
    - nocobase

versioning:
  previous_version: null
  change_log:
    - id: CHG-001
      version: 0.1.0
      type: created
      description: 基于工单系统 archetype 生成初始 PRD 草案
      source: ai_generated
      date: YYYY-MM-DD

audit:
  source_policy:
    allowed_values:
      - user_explicit
      - archetype_default
      - ai_assumption
      - derived
  confirmation_policy:
    allowed_values:
      - confirmed
      - pending_confirmation
      - rejected

assumptions: []
open_questions: []
business_goals: []
scope: {}
roles: []
requirements: []
business_objects: []
processes: []
pages: []
permissions: []
metrics: []
acceptance_tests: []
traceability: []
build_readiness: {}
```

## ID Conventions

Use stable IDs. Do not renumber existing IDs during revision.

| Type | Prefix | Example |
| --- | --- | --- |
| Requirement | `REQ-` | `REQ-TICKET-001` |
| Role | `ROLE-` | `ROLE-REQUESTER` |
| Business object | `OBJ-` | `OBJ-TICKET` |
| Field | `FIELD-` | `FIELD-TICKET-STATUS` |
| Process | `PROC-` | `PROC-TICKET-LIFECYCLE` |
| Page | `PAGE-` | `PAGE-MY-TICKETS` |
| Permission | `PERM-` | `PERM-REQUESTER-TICKET-OWN` |
| Metric | `METRIC-` | `METRIC-TICKET-COUNT-BY-STATUS` |
| Acceptance test | `AT-` | `AT-SUBMIT-TICKET` |
| Assumption | `A-` | `A-INTERNAL-USERS` |
| Question | `Q-` | `Q-SLA-REQUIRED` |
| Change | `CHG-` | `CHG-001` |

## Common Item Fields

Every important item must include:

```yaml
id: REQ-EXAMPLE-001
name: 示例需求
description: 示例说明
source: archetype_default
confirmation: pending_confirmation
introduced_in: 0.1.0
evidence: 工单系统 archetype 默认 MVP
```

## Assumptions

```yaml
assumptions:
  - id: A-INTERNAL-USERS
    text: 默认工单系统仅供企业内部员工使用
    source: archetype_default
    confirmation: pending_confirmation
    introduced_in: 0.1.0
    affects:
      - roles
      - pages
      - permissions
```

## Open Questions

```yaml
open_questions:
  - id: Q-SLA-REQUIRED
    question: 是否需要 SLA 超时规则和升级提醒？
    reason: 会影响数据模型、工作流、通知和统计指标
    default_if_unanswered: 暂不启用复杂 SLA，仅保留优先级字段
    blocking_level: non_blocking
    affects:
      - business_objects
      - processes
      - metrics
      - workflows
    status: open
```

`blocking_level` values:

- `build_blocking`: downstream build planning would require guessing a core choice.
- `non_blocking`: a reasonable default exists and can be revised later.

## Business Goals

```yaml
business_goals:
  - id: GOAL-001
    problem: 员工问题处理缺少统一入口和状态追踪
    objective: 建立提交、分派、处理、关闭和统计闭环
    success_metrics:
      - 工单状态可追踪
      - 处理责任人明确
      - 主管可查看处理效率
    source: archetype_default
    confirmation: pending_confirmation
    introduced_in: 0.1.0
```

## Scope

```yaml
scope:
  mvp:
    - id: SCOPE-MVP-001
      name: 工单提交
      source: archetype_default
      confirmation: pending_confirmation
      introduced_in: 0.1.0
  optional:
    - id: SCOPE-OPT-001
      name: SLA 超时规则
      source: archetype_default
      confirmation: pending_confirmation
      introduced_in: 0.1.0
  out_of_scope:
    - id: SCOPE-OOS-001
      name: 复杂排班
      source: archetype_default
      confirmation: pending_confirmation
      introduced_in: 0.1.0
```

## Roles

```yaml
roles:
  - id: ROLE-REQUESTER
    name: 提单人
    responsibilities:
      - 提交工单
      - 查看自己的工单
    source: archetype_default
    confirmation: pending_confirmation
    introduced_in: 0.1.0
```

## Requirements

```yaml
requirements:
  - id: REQ-TICKET-001
    name: 提交工单
    description: 提单人可以填写标题、描述、分类、优先级并提交工单
    priority: must
    related_roles:
      - ROLE-REQUESTER
    related_objects:
      - OBJ-TICKET
    source: archetype_default
    confirmation: pending_confirmation
    introduced_in: 0.1.0
```

`priority` values: `must`, `should`, `could`, `wont`.

## Business Objects

Keep this business-level. Do not force NocoBase implementation names here.

```yaml
business_objects:
  - id: OBJ-TICKET
    name: 工单
    description: 用户提交的问题或服务请求
    fields:
      - id: FIELD-TICKET-TITLE
        name: 标题
        business_type: short_text
        required: true
        source: archetype_default
        confirmation: pending_confirmation
        introduced_in: 0.1.0
      - id: FIELD-TICKET-STATUS
        name: 状态
        business_type: enum
        required: true
        values:
          - submitted
          - assigned
          - processing
          - resolved
          - closed
          - cancelled
        source: archetype_default
        confirmation: pending_confirmation
        introduced_in: 0.1.0
```

Preferred `business_type` values:

- `short_text`
- `long_text`
- `enum`
- `number`
- `date`
- `datetime`
- `boolean`
- `file`
- `user_relation`
- `object_relation`
- `department_relation`
- `rich_text`

## Processes

```yaml
processes:
  - id: PROC-TICKET-LIFECYCLE
    name: 工单生命周期
    trigger: 工单创建
    states:
      - submitted
      - assigned
      - processing
      - resolved
      - closed
      - cancelled
    transitions:
      - from: submitted
        to: assigned
        action: 分派处理人
        actor: ROLE-SUPERVISOR
      - from: processing
        to: resolved
        action: 处理完成
        actor: ROLE-AGENT
    exceptions:
      - 工单可被取消
    source: archetype_default
    confirmation: pending_confirmation
    introduced_in: 0.1.0
```

## Pages

```yaml
pages:
  - id: PAGE-SUBMIT-TICKET
    name: 提交工单
    primary_roles:
      - ROLE-REQUESTER
    purpose: 创建新工单
    main_objects:
      - OBJ-TICKET
    main_actions:
      - create_ticket
    source: archetype_default
    confirmation: pending_confirmation
    introduced_in: 0.1.0
```

## Permissions

Keep policies business-level. The ACL skill will map them to NocoBase ACL details later.

```yaml
permissions:
  - id: PERM-REQUESTER-TICKET-OWN
    role: ROLE-REQUESTER
    object: OBJ-TICKET
    data_scope: own
    actions:
      - create
      - view
      - comment
      - close_confirm
    source: archetype_default
    confirmation: pending_confirmation
    introduced_in: 0.1.0
```

Suggested `data_scope` values:

- `own`
- `assigned_to_me`
- `department_or_team`
- `all`
- `custom`

## Metrics

```yaml
metrics:
  - id: METRIC-TICKET-COUNT-BY-STATUS
    name: 按状态统计工单数
    purpose: 了解当前工单积压和处理进度
    related_objects:
      - OBJ-TICKET
    source: archetype_default
    confirmation: pending_confirmation
    introduced_in: 0.1.0
```

## Acceptance Tests

Acceptance tests must be business scenarios, not implementation commands.

```yaml
acceptance_tests:
  - id: AT-SUBMIT-TICKET
    scenario: 提单人提交工单
    given: 用户具有提单人角色
    when: 用户填写标题、描述、分类和优先级后提交
    then: 系统生成状态为 submitted 的工单，且该用户可在我的工单中看到记录
    covers:
      - REQ-TICKET-001
      - PAGE-SUBMIT-TICKET
      - PERM-REQUESTER-TICKET-OWN
    source: archetype_default
    confirmation: pending_confirmation
    introduced_in: 0.1.0
```

## Traceability

Traceability connects PRD items to later build tasks.

```yaml
traceability:
  - requirement: REQ-TICKET-001
    implemented_by_planned:
      - object: OBJ-TICKET
      - page: PAGE-SUBMIT-TICKET
      - permission: PERM-REQUESTER-TICKET-OWN
    validated_by:
      - AT-SUBMIT-TICKET
```

## Build Readiness

```yaml
build_readiness:
  status: blocked
  checks:
    product_goal_defined: true
    user_scope_confirmed: false
    roles_defined: true
    core_objects_defined: true
    core_processes_defined: true
    pages_defined: true
    permissions_defined: true
    acceptance_tests_defined: true
    blocking_questions_empty: false
    user_approval_received: false
  blockers:
    - Q-USER-SCOPE
  notes:
    - 用户确认 PRD 后可进入 NocoBase BuildPlan 设计
```

Status rules:

- `ready`: all checks true and PRD status is `approved`.
- `partial`: all core structure exists, but one or more non-blocking questions remain.
- `blocked`: any build-blocking question remains, or a core section is missing.

## Approval Rule

Only use:

```yaml
prd:
  status: approved
build_readiness:
  status: ready
```

after the user explicitly says the PRD is approved, confirmed, or can enter build planning.
