# Ticketing Archetype

Use this archetype when the user asks for 工单系统, ticketing, service desk, IT 报修, 售后服务, 运维派单, 问题反馈处理, or similar request/issue handling systems.

## Archetype Metadata

```yaml
archetype:
  id: ticketing
  name: 工单系统
  version: 0.1.0
  product_classification:
    business_attribute: enterprise_internal
    functional_type: business_management
  typical_intent:
    - 我想要一个工单系统
    - 我要做客服工单
    - 我要内部问题反馈处理系统
    - 我要 IT 报修系统
    - 我要售后服务工单
    - 我要运维派单系统
  core_value:
    - 统一问题入口
    - 明确处理责任人
    - 跟踪处理状态
    - 沉淀处理记录
    - 统计效率与服务质量
```

## Default MVP Scope

```yaml
mvp_scope:
  included:
    - 工单提交
    - 工单分类
    - 工单分派
    - 工单处理
    - 工单评论/处理记录
    - 工单关闭
    - 基础满意度评价
    - 基础统计看板
  optional:
    - SLA 超时规则
    - 自动分派
    - 多部门协作
    - 知识库沉淀
    - 外部客户入口
    - 通知集成
    - 工单重新打开
  excluded_by_default:
    - 复杂排班
    - 多租户客户门户
    - AI 自动回复
    - 复杂计费/售后合同
    - 现场服务路线规划
```

## Critical Questions

Ask at most these five questions in the first round.

```yaml
critical_questions:
  - id: Q-USER-SCOPE
    question: 这个工单系统是仅内部员工使用，还是外部客户也会提交工单？
    why: 会影响角色、入口页面、权限和数据隔离
    default_if_unanswered: internal_only
    blocking_level: build_blocking
  - id: Q-ASSIGNMENT-MODE
    question: 工单由主管手动分派，还是需要按分类/部门自动分派？
    why: 会影响工作流、字段和页面动作
    default_if_unanswered: manual_by_supervisor
    blocking_level: non_blocking
  - id: Q-SLA
    question: 是否需要 SLA 超时规则和升级提醒？
    why: 会影响 SLA 对象、定时工作流、提醒和统计指标
    default_if_unanswered: no_complex_sla
    blocking_level: non_blocking
  - id: Q-REOPEN
    question: 工单解决后，是否允许提单人重新打开？
    why: 会影响状态机和处理流程
    default_if_unanswered: false
    blocking_level: non_blocking
  - id: Q-RATING
    question: 是否需要满意度评价和处理效率统计？
    why: 会影响评价对象、看板和验收指标
    default_if_unanswered: rating_and_basic_dashboard
    blocking_level: non_blocking
```

Default answers when the user says "你来定":

```yaml
defaults:
  user_scope: internal_only
  assignment_mode: manual_by_supervisor
  sla: no_complex_sla
  reopen: false
  rating: true
  dashboard: basic
```

## Default Roles

```yaml
roles:
  - id: ROLE-REQUESTER
    name: 提单人
    responsibilities:
      - 提交工单
      - 查看自己的工单
      - 补充问题信息
      - 确认关闭工单
  - id: ROLE-AGENT
    name: 处理人
    responsibilities:
      - 查看分派给自己的工单
      - 更新处理进度
      - 添加处理记录
      - 标记处理完成
  - id: ROLE-SUPERVISOR
    name: 主管
    responsibilities:
      - 查看团队工单
      - 分派或调整处理人
      - 跟踪超时和积压
      - 查看统计看板
  - id: ROLE-ADMIN
    name: 管理员
    responsibilities:
      - 配置工单分类
      - 管理角色权限
      - 配置基础参数
      - 查看全量数据
```

Optional roles:

```yaml
optional_roles:
  - id: ROLE-CUSTOMER
    name: 外部客户
    when: user_scope includes external customers
  - id: ROLE-DISPATCHER
    name: 派单员
    when: assignment is centralized but not done by supervisor
```

## Default Business Objects

```yaml
business_objects:
  - id: OBJ-TICKET
    name: 工单
    fields:
      - id: FIELD-TICKET-TITLE
        name: 标题
        business_type: short_text
        required: true
      - id: FIELD-TICKET-DESCRIPTION
        name: 问题描述
        business_type: long_text
        required: true
      - id: FIELD-TICKET-CATEGORY
        name: 分类
        business_type: object_relation
        target: OBJ-TICKET-CATEGORY
        required: true
      - id: FIELD-TICKET-PRIORITY
        name: 优先级
        business_type: enum
        values:
          - low
          - normal
          - high
          - urgent
        required: true
      - id: FIELD-TICKET-STATUS
        name: 状态
        business_type: enum
        values:
          - submitted
          - assigned
          - processing
          - resolved
          - closed
          - cancelled
        required: true
      - id: FIELD-TICKET-REQUESTER
        name: 提单人
        business_type: user_relation
        required: true
      - id: FIELD-TICKET-ASSIGNEE
        name: 处理人
        business_type: user_relation
        required: false
      - id: FIELD-TICKET-DEPARTMENT
        name: 归属部门
        business_type: department_relation
        required: false
      - id: FIELD-TICKET-ATTACHMENTS
        name: 附件
        business_type: file
        required: false
      - id: FIELD-TICKET-SUBMITTED-AT
        name: 提交时间
        business_type: datetime
        required: true
      - id: FIELD-TICKET-RESOLVED-AT
        name: 解决时间
        business_type: datetime
        required: false
      - id: FIELD-TICKET-CLOSED-AT
        name: 关闭时间
        business_type: datetime
        required: false
  - id: OBJ-TICKET-CATEGORY
    name: 工单分类
    fields:
      - id: FIELD-CATEGORY-NAME
        name: 分类名称
        business_type: short_text
        required: true
      - id: FIELD-CATEGORY-DEFAULT-ASSIGNEE
        name: 默认处理人
        business_type: user_relation
        required: false
  - id: OBJ-TICKET-COMMENT
    name: 处理记录/评论
    fields:
      - id: FIELD-COMMENT-TICKET
        name: 所属工单
        business_type: object_relation
        target: OBJ-TICKET
        required: true
      - id: FIELD-COMMENT-CONTENT
        name: 内容
        business_type: long_text
        required: true
      - id: FIELD-COMMENT-AUTHOR
        name: 记录人
        business_type: user_relation
        required: true
      - id: FIELD-COMMENT-CREATED-AT
        name: 记录时间
        business_type: datetime
        required: true
  - id: OBJ-TICKET-RATING
    name: 满意度评价
    fields:
      - id: FIELD-RATING-TICKET
        name: 所属工单
        business_type: object_relation
        target: OBJ-TICKET
        required: true
      - id: FIELD-RATING-SCORE
        name: 评分
        business_type: enum
        values:
          - 1
          - 2
          - 3
          - 4
          - 5
        required: true
      - id: FIELD-RATING-COMMENT
        name: 评价说明
        business_type: long_text
        required: false
```

Optional objects:

```yaml
optional_objects:
  - id: OBJ-SLA-POLICY
    name: SLA 规则
    when: SLA is enabled
  - id: OBJ-ESCALATION-RECORD
    name: 升级记录
    when: SLA escalation is enabled
  - id: OBJ-KNOWLEDGE-ARTICLE
    name: 知识库文章
    when: knowledge base is enabled
```

## Default Lifecycle

```yaml
process:
  id: PROC-TICKET-LIFECYCLE
  name: 工单生命周期
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
    - from: assigned
      to: processing
      action: 开始处理
      actor: ROLE-AGENT
    - from: processing
      to: resolved
      action: 标记处理完成
      actor: ROLE-AGENT
    - from: resolved
      to: closed
      action: 确认关闭
      actor: ROLE-REQUESTER
    - from: submitted
      to: cancelled
      action: 取消工单
      actor: ROLE-REQUESTER
    - from: assigned
      to: cancelled
      action: 取消工单
      actor: ROLE-SUPERVISOR
    - from: processing
      to: cancelled
      action: 取消工单
      actor: ROLE-SUPERVISOR
  optional_transitions:
    - from: resolved
      to: processing
      action: 重新打开
      actor: ROLE-REQUESTER
      when: reopen is enabled
```

## Default Pages

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
  - id: PAGE-MY-TICKETS
    name: 我的工单
    primary_roles:
      - ROLE-REQUESTER
    purpose: 查看自己提交的工单和处理进度
    main_objects:
      - OBJ-TICKET
    main_actions:
      - view_own_ticket
      - comment
      - close_confirm
  - id: PAGE-AGENT-WORKSPACE
    name: 处理工作台
    primary_roles:
      - ROLE-AGENT
    purpose: 处理分派给自己的工单
    main_objects:
      - OBJ-TICKET
      - OBJ-TICKET-COMMENT
    main_actions:
      - view_assigned_ticket
      - update_status
      - add_comment
      - resolve_ticket
  - id: PAGE-TICKET-POOL
    name: 工单池
    primary_roles:
      - ROLE-SUPERVISOR
      - ROLE-ADMIN
    purpose: 查看待分派和团队工单，进行派单与调整
    main_objects:
      - OBJ-TICKET
    main_actions:
      - assign_ticket
      - adjust_assignee
      - export_ticket
  - id: PAGE-TICKET-DETAIL
    name: 工单详情
    primary_roles:
      - ROLE-REQUESTER
      - ROLE-AGENT
      - ROLE-SUPERVISOR
      - ROLE-ADMIN
    purpose: 查看工单基本信息、处理记录和状态流转
    main_objects:
      - OBJ-TICKET
      - OBJ-TICKET-COMMENT
      - OBJ-TICKET-RATING
  - id: PAGE-TICKET-DASHBOARD
    name: 工单统计看板
    primary_roles:
      - ROLE-SUPERVISOR
      - ROLE-ADMIN
    purpose: 查看工单量、状态分布、处理时长和满意度
    main_objects:
      - OBJ-TICKET
      - OBJ-TICKET-RATING
  - id: PAGE-TICKET-SETTINGS
    name: 工单配置
    primary_roles:
      - ROLE-ADMIN
    purpose: 配置分类、优先级、基础参数和权限
    main_objects:
      - OBJ-TICKET-CATEGORY
```

## Default Permissions

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
  - id: PERM-AGENT-TICKET-ASSIGNED
    role: ROLE-AGENT
    object: OBJ-TICKET
    data_scope: assigned_to_me
    actions:
      - view
      - update_status
      - comment
      - resolve
  - id: PERM-SUPERVISOR-TICKET-TEAM
    role: ROLE-SUPERVISOR
    object: OBJ-TICKET
    data_scope: department_or_team
    actions:
      - view
      - assign
      - update
      - export
  - id: PERM-ADMIN-TICKET-ALL
    role: ROLE-ADMIN
    object: OBJ-TICKET
    data_scope: all
    actions:
      - all
```

## Default Metrics

```yaml
metrics:
  - id: METRIC-TICKET-COUNT-BY-STATUS
    name: 按状态统计工单数
    purpose: 查看工单积压和处理进度
  - id: METRIC-TICKET-COUNT-BY-CATEGORY
    name: 按分类统计工单数
    purpose: 识别高频问题类型
  - id: METRIC-AVG-RESOLUTION-TIME
    name: 平均处理时长
    purpose: 衡量处理效率
  - id: METRIC-OVERDUE-RATE
    name: 超时率
    purpose: 监控 SLA 或处理承诺
    when: SLA is enabled
  - id: METRIC-RATING-AVERAGE
    name: 平均满意度
    purpose: 衡量服务质量
```

## Default Acceptance Tests

```yaml
acceptance_tests:
  - id: AT-SUBMIT-TICKET
    scenario: 提单人提交工单
    given: 用户具有提单人角色
    when: 用户填写标题、描述、分类和优先级后提交
    then: 系统生成 submitted 状态的工单，且该用户可在我的工单中看到记录
  - id: AT-ASSIGN-TICKET
    scenario: 主管分派工单
    given: 存在 submitted 状态工单
    when: 主管选择处理人并分派
    then: 工单状态变为 assigned，处理人可以在处理工作台看到该工单
  - id: AT-PROCESS-TICKET
    scenario: 处理人完成工单
    given: 工单已分派给处理人
    when: 处理人更新处理记录并标记解决
    then: 工单状态变为 resolved，并保留处理记录
  - id: AT-CLOSE-RATE-TICKET
    scenario: 提单人确认关闭并评价
    given: 工单状态为 resolved
    when: 提单人确认关闭并提交评分
    then: 工单状态变为 closed，系统保存满意度评价
  - id: AT-PERMISSION-SCOPE
    scenario: 数据权限隔离
    given: 存在多个提单人和处理人
    when: 不同角色访问工单列表
    then: 提单人只能看到自己的工单，处理人只能看到分派给自己的工单，主管看到团队工单，管理员看到全量工单
```

## Build Readiness Requirements

A ticketing PRD is ready for build planning only when:

```yaml
build_readiness_required:
  - user_scope_confirmed
  - assignment_mode_confirmed_or_defaulted
  - ticket_lifecycle_confirmed
  - roles_and_data_permissions_confirmed
  - sla_decision_confirmed_or_defaulted
  - rating_decision_confirmed_or_defaulted
  - mvp_page_scope_confirmed
  - acceptance_tests_present
```

If `Q-USER-SCOPE` is unanswered, use `build_readiness.status: blocked`.

If only non-blocking questions remain and clear defaults were applied, use `partial` unless the user explicitly approves the defaults.

## PRD v0.1 Drafting Guidance

For a one-line request such as "我想要一个工单系统":

1. Classify it as `enterprise_internal × business_management × ticketing` unless there is evidence of external SaaS or customer portal scope.
2. Generate an internal employee ticketing MVP.
3. Mark all archetype items as `source: archetype_default` and `confirmation: pending_confirmation`.
4. Add `A-INTERNAL-USERS` assumption.
5. Add the five critical questions.
6. Set `build_readiness.status: blocked` because user scope is build-blocking.
