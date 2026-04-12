---
name: nocobase-acl-manage
description: Task-driven ACL governance through MCP for role lifecycle, global role mode, permission policy, user-role membership, and risk assessment. Use when users describe business permission outcomes instead of raw tool arguments.
argument-hint: "[task: role.*|global.role-mode.*|permission.*|user.*|risk.*] [target?] [data_source_key?] [strict_mode?]"
allowed-tools: NocoBase MCP ACL tools (`roles:*`, `available_actions_list`, `data_sources_roles:*`, `roles_data_source_resources:*`, `roles_desktop_routes:*`, `roles_resources_scopes:*`, `data_sources_roles_resources_scopes:*`) and guarded generic tools (`resource_*` only for user-role membership when enabled)
owner: platform-tools
version: 2.0.3
last-reviewed: 2026-04-11
risk-level: high
---

# Goal

Turn ACL and permission governance into a task-driven workflow so users can ask for business outcomes while the skill handles:

- MCP tool selection and argument shaping
- capability checks and safety guards
- write confirmation and readback evidence
- risk-oriented explanation for high-impact changes

# Scope

- This skill is MCP-first for reads and writes.
- Tasks are grouped into four domains:
- role
- permission
- user
- risk assessment
- Every write task follows `plan -> confirm -> apply -> readback`.
- `global role mode` is treated as a global system policy, not a per-role field.

# Non-Goals

- Do not bypass MCP by calling REST endpoints directly.
- Do not mutate ACL through ad-hoc database operations.
- Do not hide high-impact blast radius (global mode, broad snippets, broad strategy actions).
- Do not claim one-click coverage for workflows that require governance review.

# Canonical Task Model

## A) Role Domain

| Task | User Outcome | Required Inputs | Optional Inputs |
|---|---|---|---|
| `role.audit-all` | list all roles with comparable policy summary | none | `data_source_key`, `output` |
| `role.create-blank` | create a role with default read-only baseline (single creation mode) | `role_name` | `role_title`, `description`, `hidden`, `allow_configure`, `allow_new_menu` |
| `role.compare` | explain differences between roles | `role_names[]` | `data_source_key`, `output` |

## B) Global Role-Mode Domain

| Task | User Outcome | Required Inputs | Optional Inputs |
|---|---|---|---|
| `global.role-mode.get` | read current global role mode | none | `output` |
| `global.role-mode.set` | switch global role mode | `role_mode` | `strict_mode` |

`role_mode` enum mapping:

- `default`: independent role usage (no union mode)
- `allow-use-union`: union mode available, role switching still allowed
- `only-use-union`: force union mode for multi-role users

## C) Permission Domain

| Task | User Outcome | Required Inputs | Optional Inputs |
|---|---|---|---|
| `permission.system-snippets.set` | set role-level system snippets | `role_name`, (`snippet_preset` or `snippets`) | none |
| `permission.route.desktop.set` | set desktop route permissions for a role | `role_name`, `route_ids[]` | `set_mode` (`set` or `add` or `remove`) |
| `permission.data-source.global.set` | set global strategy actions for all tables in one data source | `role_name`, `global_actions[]` | `data_source_key` |
| `permission.data-source.resource.set` | set independent actions for one or more collections | `role_name`, (`collection_hint` or `collection_hints[]`), `actions[]`, `resource_scope` | `data_source_key`, `fields_map`, `scope_map` |
| `permission.scope.manage` | create/update/list reusable scopes | `scope_task` | `data_source_key`, `scope_id`, `scope_payload` |

## D) User Domain

| Task | User Outcome | Required Inputs | Optional Inputs |
|---|---|---|---|
| `user.assign-role` | assign one role to one or many users | `role_name`, (`user_ids[]` or `user_filter`) | `allow_generic_association_write` |
| `user.unassign-role` | remove one role from one or many users | `role_name`, (`user_ids[]` or `user_filter`) | `allow_generic_association_write` |
| `user.audit-role-membership` | inspect users bound to roles | (`role_name` or `user_id`) | `output` |

## E) Risk Domain

| Task | User Outcome | Required Inputs | Optional Inputs |
|---|---|---|---|
| `risk.assess-role` | risk score and rationale for one role | `role_name` | `data_source_key`, `output` |
| `risk.assess-user` | risk score based on user-role-permission relationship | `user_id` | `data_source_key`, `output` |
| `risk.assess-system` | system-level ACL governance risk summary | none | `data_source_key`, `output` |

Role creation interaction policy:

- always create with the same default read-only baseline (`role.create-blank`)
- do not ask users to choose role archetypes (for example, "employee/auditor/manager/custom")
- if `role_name` exists, execute creation directly
- after creation succeeds, move to permission assignment guidance
- permission follow-up options: system snippets, desktop routes, data-source global strategy, data-source resource strategy

Resource permission interaction policy:

- before executing `permission.data-source.resource.set`, always confirm:
- data source key (`main` by default unless user specifies another)
- resolved target collection(s)
- action list
- data scope
- disambiguate operation verbs from ACL action names:
- phrases like `add table permission` / `configure permission` describe the operation, not ACL action `create`
- only treat `create` as selected action when user clearly asks for data-creation capability (`can create records` / `can add data`)
- user does not need to provide exact technical collection names
- accept business names or keywords as `collection_hint(s)`
- resolve real collection names from the selected data source collection list
- if matching is ambiguous, present candidates and ask user to choose
- if no match is found, ask user for a clearer business keyword
- when reading collection metadata, always pass required filter shape:
- `roles_data_sources_collections_list` must include `filter.dataSourceKey`
- `roles_data_source_resources_get` must include `filter.dataSourceKey` and `filter.name`
- if a read call returns errors like `Cannot destructure property 'dataSourceKey'` or `Cannot read properties of undefined (reading 'dataSourceKey')`, treat it as argument-shape mismatch, repair arguments, and retry once
- resolve scope binding before write:
- `all` -> built-in scope `key=all` id in target data source
- `own` -> built-in scope `key=own` id in target data source
- `custom` -> user-specified scope id (or resolved scope key)
- do not leave action scope as `null` when user selected `all` or `own`
- before any write, show confirmation summary (data source + resolved collections + actions + scope)
- if any required item is missing or unresolved, ask user first and do not write
- default field rule: all fields
- full-field default must be written as explicit field-name lists resolved from target collection metadata
- do not use `fields=[]` as a full-field default marker
- if user did not provide field-level restrictions, apply full-field permission for each selected action
- apply full-field default to every selected action that supports field configuration (`create`, `view`, `update`, `export`, `importXlsx`)
- full-field default must include system fields returned by metadata (for example `sort`, `createdBy`, `createdById`, `updatedBy`, `updatedById`) unless user explicitly asks to exclude them
- use technical field names (`field.name`) for writes, never display titles
- do not auto-drop fields only because they are system/context/relation/hidden; only exclude when user intent explicitly restricts them
- `view` action must default to all fields for that collection
- if user explicitly asks for `all permissions` on a collection, resolve runtime available actions and confirm expanded action set before write

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `task` | yes | none | one of canonical tasks or alias | "Which ACL governance task should run?" |
| `role_name` | conditional | none | role exists for update/audit tasks | "Which role should be targeted?" |
| `role_mode` | conditional | none | one of `default/allow-use-union/only-use-union` | "Which global role mode should be set?" |
| `collection_hint` / `collection_hints[]` | conditional | none | required for `permission.data-source.resource.set`; business name/keyword input is allowed | "Which business table(s) should be configured?" |
| `resolved_collection_names[]` | conditional | runtime resolved | required before write for `permission.data-source.resource.set`; each collection must exist in selected data source | "I found these matching collections. Which should be used?" |
| `actions[]` | conditional | none | required for `permission.data-source.resource.set` | "Which actions should be granted on these collections?" |
| `resource_scope` | conditional | none | required for `permission.data-source.resource.set`; one of `all` / `own` / `custom(scope_id or scope_filter)` | "Which data scope should be used: all, own, or custom?" |
| `data_source_key` | no | `main` | must exist at runtime | "Which data source key should be used? (default: main)" |
| `strict_mode` | no | `safe` | `safe` or `fast` | "Use safe mode with full readback?" |
| `allow_generic_association_write` | no | `false` | boolean | "Allow guarded generic association writes for user-role assignment?" |
| `output` | no | `text+matrix` | `text`, `text+matrix`, `text+evidence` | "How detailed should the result be?" |

Default behavior when user says `you decide`:

- choose role tasks for role intent
- choose permission tasks for policy intent
- choose user tasks for assignment intent
- choose risk tasks for assessment intent
- for role creation intent, always use `role.create-blank` first
- `data_source_key=main`
- `strict_mode=safe`

# Mandatory Clarification Gate

- max clarification rounds: `2`
- max questions per round: `3`
- never execute writes before required inputs are complete
- for `role.create-blank`, ask only for `role_name` when missing; do not ask role-type questions
- for `permission.data-source.resource.set`, default `data_source_key=main` when omitted unless user explicitly provides another data source
- for `permission.data-source.resource.set`, if collection hint cannot be resolved or is ambiguous, ask follow-up questions before write
- for `permission.data-source.resource.set`, if actions/scope are incomplete, ask follow-up questions before write
- for `permission.data-source.resource.set`, if user has not confirmed the final write plan, do not write
- if user asks to set role mode for a specific role, clarify and normalize to global mode change
- if task implies writes and target identity is missing, stop and ask first
- if MCP returns auth errors (`401`, `permission denied`), stop and request recovery

# Workflow

1. Resolve intent and normalize task.
- map aliases to canonical tasks
- map natural-language role mode wording to `default/allow-use-union/only-use-union`
- normalize any create-role wording to `role.create-blank` baseline first, then permission assignment

2. Capability gate.
- confirm `initialize`, `tools/list`, and `tools/call`
- resolve runtime tool names via `intent-to-tool-map-v1`

3. Plan before writes.
- list proposed change set, readback checkpoints, and blast radius
- for high-impact writes require explicit confirmation
- for resource permission writes, include:
- data source key
- resolved target collection list
- action list
- scope choice
- resolved scope binding (`scopeId` / scope key)
- field policy (`all fields` by default unless user provided restrictions)
- resolved full-field list per action when field restrictions are omitted

4. Execute one task at a time.
- keep writes minimal and scoped
- prefer ACL-specific tools

5. Readback verification.
- verify target data changed as requested
- include concise evidence blocks

6. Risk and boundary reporting.
- return high-impact notes even on success
- use friendly boundary messaging for unsupported paths

# Tooling Policy

Primary write path:

- ACL-specific MCP tools only

Guarded fallback path (user-role membership only):

- allowed only when `allow_generic_association_write=true`
- use generic `resource_*` tools only for `users.roles` association operations
- mandatory readback after write

Hard restrictions:

- never use direct HTTP fallback
- never use direct database mutation
- never use generic tools for ACL policy writes when ACL tools exist

# High-Impact Actions

- changing global role mode
- broad system snippets (`ui.*`, `pm`, `pm.*`, `app`)
- broad data-source actions (`destroy`, broad export/import grants)
- role assignment to many users

# Capability Boundary Messaging

When a scenario is not supported by current MCP/tool policy:

- `This scenario is currently blocked by capability or governance policy in this skill.`
- `Please complete the operation in NocoBase admin UI, or enable the guarded fallback option if available.`
- `If you want, I can provide exact UI navigation steps and field suggestions.`

Preferred Chinese wording:

- `当前场景受 MCP 能力或本技能治理策略限制，暂不支持直接执行。`
- `你可以先在 NocoBase 管理后台完成该操作；如支持，我也可以切换到受控兜底路径。`
- `如果你愿意，我可以继续给你提供精确的页面入口和字段填写建议。`

# Verification Checklist

- task normalized to canonical task
- required inputs complete before writes
- MCP capability gate passes
- runtime tool names resolved
- every write has immediate readback evidence
- for `permission.data-source.resource.set`, data source + resolved collections + actions + scope were confirmed before write
- for `roles_data_sources_collections_list`, calls always include `filter.dataSourceKey`
- for `roles_data_source_resources_get`, calls always include `filter.dataSourceKey` + `filter.name`
- for `permission.data-source.resource.set`, when scope is `all` or `own`, readback must show non-null `scopeId` and matching scope key
- when field rules were omitted by user, full-field defaults were applied explicitly as non-empty field-name lists
- when full-field defaults are used, readback field lists match requested names and do not silently lose system fields
- global role-mode tasks do not require `role_name`
- boundary messages are clear and actionable

# Minimal Test Scenarios

1. `global.role-mode.get` and `global.role-mode.set` with readback.
2. `role.create-blank` then verify role exists and has conservative defaults.
3. `permission.data-source.global.set` and verify strategy actions.
4. `permission.data-source.resource.set` with business collection name should auto-resolve real collection name(s) from target data source.
5. `permission.data-source.resource.set` with ambiguous collection match should ask for disambiguation before write.
6. `permission.data-source.resource.set` with missing actions/scope should ask for clarification before write.
7. `permission.data-source.resource.set` with `view` and no field restrictions should apply full-field permission by default via explicit non-empty field lists.
8. `permission.data-source.resource.set` with scope=`all` should write explicit built-in scope binding (non-null `scopeId` for key=`all`).
9. `permission.data-source.resource.set` should require pre-write confirmation including data source + resolved collections + actions + scope.
10. `user.assign-role` in strict mode should block when no dedicated membership tool exists.
11. `user.assign-role` with guarded fallback enabled should succeed with readback.
12. `risk.assess-role` should return score + evidence + recommendations.
13. `roles_data_sources_collections_list` and `roles_data_source_resources_get` should not be called without required `filter` keys.
14. Full-field default should preserve system fields in readback when metadata includes them.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [references/intent-presets-v1.md](references/intent-presets-v1.md) | intent normalization and defaults | includes global role-mode wording |
| [references/intent-to-tool-map-v1.md](references/intent-to-tool-map-v1.md) | runtime tool resolution | includes guarded fallback for user membership |
| [references/result-format-v1.md](references/result-format-v1.md) | output rendering | includes risk cards and capability path |
| [references/configuration.md](references/configuration.md) | ACL policy details | detailed data-source and scope guidance |
| [references/capability-test-plan.md](references/capability-test-plan.md) | capability matrix | aligned with v2 domains |
| [references/refactor-plan-v2.md](references/refactor-plan-v2.md) | capability gaps and rollout plan | includes MCP/runtime/source-based gap analysis |
| [tests/README.md](tests/README.md) | runtime verification | runner and report usage |

# References

- [Intent Presets v1](references/intent-presets-v1.md)
- [Intent To Tool Map v1](references/intent-to-tool-map-v1.md)
- [Result Format v1](references/result-format-v1.md)
- [ACL Configuration Details](references/configuration.md)
- [ACL Capability Test Plan](references/capability-test-plan.md)
- [ACL Refactor Plan v2](references/refactor-plan-v2.md)
- [ACL MCP Capability Runner](tests/README.md)
- [NocoBase ACL Handbook](https://docs.nocobase.com/handbook/acl) [verified: 2026-04-11]

