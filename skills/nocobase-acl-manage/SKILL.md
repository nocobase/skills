---
name: nocobase-acl-manage
description: Task-driven ACL governance through nb CLI for role lifecycle, global role mode, permission policy, user-role membership, and risk assessment. Use when users describe business permission outcomes instead of raw command arguments.
argument-hint: "[task: role.*|global.role-mode.*|permission.*|user.*|risk.*] [target?] [data_source_key?] [strict_mode?]"
allowed-tools: shell, local file reads
owner: platform-tools
version: 2.5.3
last-reviewed: 2026-04-23
risk-level: high
---

# Goal

Turn ACL and permission governance into a task-driven workflow so users can ask for business outcomes while the skill handles:

- CLI command selection and argument shaping
- capability checks and safety guards
- write confirmation and readback evidence
- risk-oriented explanation for high-impact changes

# Scope

- This skill is CLI-first for reads and writes.
- Tasks are grouped into five domains:
- role
- global role mode
- permission
- user
- risk assessment
- Every write task follows `plan -> confirm -> apply -> readback`.
- `global role mode` is treated as a global system policy, not a per-role field.

# Non-Goals

- Do not bypass CLI by calling direct REST endpoints.
- Do not mutate ACL through ad-hoc database operations.
- Do not create temporary script files to execute ACL writes.
- Do not invoke other skills for env/plugin bootstrap; use direct `nb` commands in this skill.
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
| `permission.data-source.resource.set` | set independent actions for one or more collections | `role_name`, (`collection_hint` or `collection_hints[]`), `actions[]` | `data_source_key`, `fields_map`, `scope_map`, `resource_scope` (`all` by default) |
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
- `role_name` must use NocoBase role uid format with `r_` prefix
- if user input has no `r_` prefix, normalize to `r_<normalized_name>` and show normalized value in confirmation/readback
- do not ask users to choose role archetypes (for example, "employee/auditor/manager/custom")
- if `role_name` is provided, execute creation directly
- after creation succeeds, move to permission assignment guidance
- permission follow-up options: system snippets, desktop routes, data-source global strategy, data-source resource strategy

Resource permission interaction policy:

- before executing `permission.data-source.resource.set`, always confirm:
- data source key (`main` by default unless user specifies another)
- resolved target collection(s)
- action list
- data scope (`all` by default when user does not specify)
- disambiguate operation verbs from ACL action names:
- phrases like `add table permission` / `configure permission` describe the operation, not ACL action `create`
- only treat `create` as selected action when user clearly asks for data-creation capability (`can create records` / `can add data`)
- user does not need to provide exact technical collection names
- accept business names or keywords as `collection_hint(s)`
- resolve real collection names from the selected data source collection list
- if matching is ambiguous, present candidates and ask user to choose
- if no match is found, ask user for a clearer business keyword
- resolve scope binding before write:
- if user does not specify scope, default to `all`
- `all` -> built-in scope `key=all` id in target data source
- `own` -> built-in scope `key=own` id in target data source
- `custom` -> user-specified scope id (or resolved scope key)
- do not leave action scope as `null` when final scope is `all` or `own`
- write completeness (hard rule):
- for `permission.data-source.resource.set`, execute one complete write payload per target collection
- the write payload must include `usingActionsConfig: true`
- the same payload must include the final `actions[]` set, with explicit scope binding (`scopeId` or `scopeKey`) for `all|own` and explicit non-empty `fields` arrays for field-configurable actions
- do not stage writes as "set actions first, then patch fields/scope/usingActionsConfig"
- before any write, show confirmation summary (data source + resolved collections + actions + scope)
- when scope is defaulted, confirmation must explicitly state `scope=all (default)` and allow user override
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
| `role_name` | conditional | none | role exists for update/audit tasks; write tasks normalize to `r_*` uid | "Which role should be targeted?" |
| `role_mode` | conditional | none | one of `default/allow-use-union/only-use-union` | "Which global role mode should be set?" |
| `collection_hint` / `collection_hints[]` | conditional | none | required for `permission.data-source.resource.set`; business name/keyword input is allowed | "Which business table(s) should be configured?" |
| `resolved_collection_names[]` | conditional | runtime resolved | required before write for `permission.data-source.resource.set`; each collection must exist in selected data source | "I found these matching collections. Which should be used?" |
| `actions[]` | conditional | none | required for `permission.data-source.resource.set` | "Which actions should be granted on these collections?" |
| `resource_scope` | no | `all` | one of `all` / `own` / `custom(scope_id or scope_filter)` | "Which data scope should be used? Default is all; choose own/custom only when needed." |
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
- for write tasks with `role_name`, normalize to `r_*` uid and echo normalized value in confirmation
- for `permission.data-source.resource.set`, default `data_source_key=main` when omitted unless user explicitly provides another data source
- for `permission.data-source.resource.set`, if collection hint cannot be resolved or is ambiguous, ask follow-up questions before write
- for `permission.data-source.resource.set`, if actions are incomplete, ask follow-up questions before write
- for `permission.data-source.resource.set`, if scope is omitted, apply default `all` and require confirmation before write
- for `permission.data-source.resource.set`, if custom scope is requested but scope id/key is unresolved, ask follow-up questions before write
- for `permission.data-source.resource.set`, if user has not confirmed the final write plan, do not write
- if user asks to set role mode for a specific role, clarify and normalize to global mode change
- if task implies writes and target identity is missing, stop and ask first
- if CLI returns auth errors (`401`, `403`, `Auth required`), stop and request recovery (`@nocobase/plugin-api-keys` activation + token refresh)

# Workflow

1. Resolve intent and normalize task.
- map aliases to canonical tasks
- map natural-language role mode wording to `default/allow-use-union/only-use-union`
- normalize create-role wording to `role.create-blank` baseline first, then permission assignment

2. Capability gate (CLI).
- confirm direct `nb` CLI is available in PATH
- command assembly guard:
- command form must be `nb <command> [subcommand ...] [flags ...]`
- first token after `nb` must be a command (for example `env` or `api`), not a flag such as `-e`/`-t`/`-j`
- wrong: `nb -e local`
- correct: `nb api resource list --resource users -e local -j`
- raw JSON input guard (PowerShell/runtime):
- prefer structured body flags (for example `--resources`, `--actions`) over inline `--body` when possible
- if raw JSON body is required, prefer `--body-file` over inline `--body`
- `--body-file` content must be valid JSON encoded as UTF-8 without BOM
- if inline `--body` fails JSON parsing in PowerShell, regenerate payload as `--body-file` and retry once
- avoid Bash-style escaped JSON in PowerShell (for example `{\"k\":\"v\"}`), it may be parsed as invalid JSON
- policy payload guard (hard rule for independent resource writes):
- preflight must block `api acl roles data-source-resources create|update` and `api acl roles apply-data-permissions` when payload is missing or invalid (`--body-file` preferred, `--body` compatible)
- for those writes, payload must include `usingActionsConfig: true` and non-empty `actions[]`
- for actions `create/view/update/export/importXlsx`, each action must carry non-empty `fields[]`
- for every action item, scope binding must be explicit via one of:
- `scopeId` (for explicit id binding)
- `scopeKey` (for key-based resolution, such as `all`/`own`)
- `scope.{id|key}` (compatibility readback payload)
- if user intent is scope `all` or `own`, readback must show resolved non-null `scopeId`
- if guard fails, stop before CLI execution and return a fixable error
- parameter safety guard:
- command shape guard for resource permissions:
- `roles data-source-resources` only has `create|get|update`; do not call `list`
- for `roles data-source-resources get|update`, locator must be one of:
- `--filter-by-tk <resource_config_id>`
- `--data-source-key <data_source_key> --name <collection_name>`
- for action-level independent-permission readback, use `roles data-source-resources get ... --appends actions`
- for unified independent-permission writes (single or batch collections), prefer `roles apply-data-permissions --filter-by-tk <role_name> --body-file <path>`
- for `roles data-sources-collections list`, use `--data-source-key <data_source_key>` as the default locator; use `--filter` only for compatibility
- for collection/field resolution, prefer `nb api resource list --resource collections --filter '{}' --appends fields -j` as primary metadata source
- for `roles desktop-routes add`, request body must be JSON array of numeric route ids
- never execute write commands with uncertain, unresolved, or type-mismatched parameters
- lock execution base-dir before any ACL discovery/write (use one stable project root for the whole task)
- run execution guard sequence before ACL writes:
- `nb env list`
- `nb env update <current_env_name>`
- `nb api acl --help`
- `nb api acl roles --help`
- fail-closed policy:
- if `nb api acl --help` or `nb api acl roles --help` fails, stop and return capability-boundary message; do not switch to ad-hoc script execution.
- confirm current env context through direct CLI: run `nb env list` and resolve current env from the row marked with `*`
- if no env is configured/current, stop writes and ask user whether to add/switch env using direct CLI (`nb env add ...` or `nb env use ...`)
- if runtime command cache is missing/stale or command schema changed, run `nb env update <current_env_name>`
- if runtime refresh fails with `swagger:get` 404 or API documentation plugin errors, activate dependency bundle and retry:
- `nb plugin enable @nocobase/plugin-api-doc`
- `nb plugin enable @nocobase/plugin-api-keys`
- restart app before retrying runtime refresh
- if token is missing/invalid, ensure `@nocobase/plugin-api-keys` is active and refresh token env first
- resolve runtime command names via [intent-to-tool-map-v1](references/intent-to-tool-map-v1.md) and command help discovery

3. Plan before writes.
- list proposed change set, readback checkpoints, and blast radius
- for high-impact writes require explicit confirmation
- for resource permission writes, include:
- data source key
- resolved target collection list
- action list
- scope choice (default `all` when omitted)
- resolved scope binding (`scopeId` / scope key)
- field policy (`all fields` by default unless user provided restrictions)
- resolved full-field list per action when field restrictions are omitted

4. Execute one task at a time.
- keep writes minimal and scoped
- prefer ACL-specific runtime commands generated from swagger
- for `permission.data-source.resource.set`, prefer unified write via `nb api acl roles apply-data-permissions` with complete `resources[]` payload; use `roles data-source-resources create|update` only as compatibility path

5. Readback verification.
- verify target data changed as requested
- include concise evidence blocks
- for independent resource permissions, use `nb api acl roles data-source-resources get ... --appends actions` when verifying action-level scope/fields

6. Risk and boundary reporting.
- return high-impact notes even on success
- use friendly boundary messaging for unsupported paths

# Tooling Policy

Primary write path:

- ACL-specific CLI runtime commands (swagger-generated)
- for user-role membership writes, prefer dedicated ACL command path first (`nb api acl roles users add/remove`)

Guarded fallback path (user-role membership only):

- allowed only when dedicated ACL membership command is unavailable and `allow_generic_association_write=true`
- use generic `nb api resource update/list` only for `users.roles` association operations
- mandatory readback after write

Hard restrictions:

- never use direct HTTP fallback
- never use direct database mutation
- never use generic resource commands for ACL policy writes when ACL-specific runtime commands exist
- determine ACL support by checking `nb api acl --help` and `nb api acl roles --help` in the same locked `base-dir` before concluding capability status
- never create temporary `.js/.ps1/.sh` executor scripts to bypass runtime command discovery

# Safety Gate

High-impact ACL actions:

- changing global role mode
- broad system snippets (`ui.*`, `pm`, `pm.*`, `app`)
- broad data-source actions (`destroy`, broad export/import grants)
- role assignment to many users

Safety rules:

- keep high-impact writes behind explicit confirmation
- include blast-radius summary before apply
- always perform readback verification after write

# Capability Boundary Messaging

When a scenario is not supported by current CLI/runtime/tool policy:

- `This scenario is currently blocked by capability or governance policy in this skill.`
- `Please complete the operation in NocoBase admin UI, or enable the guarded fallback option if available.`
- `If you want, I can provide exact UI navigation steps and field suggestions.`

# Verification Checklist

- task normalized to canonical task
- required inputs complete before writes
- CLI capability gate passes (env context available via direct `nb env list`, runtime commands resolvable)
- CLI dependency plugins (`@nocobase/plugin-api-doc`, `@nocobase/plugin-api-keys`) are active or explicit recovery guidance is emitted
- runtime command names resolved from command map/help
- execution guard evidence includes locked `base-dir` plus `nb env list`, `nb env update <current_env_name>`, `nb api acl --help`, and `nb api acl roles --help`
- every write has immediate readback evidence
- for `permission.data-source.resource.set`, data source + resolved collections + actions + scope were confirmed before write
- when user did not provide scope, confirmation/readback shows `all` as the applied default scope
- for `permission.data-source.resource.set`, readback confirms `usingActionsConfig=true` and action-level scope/fields in the same write cycle
- for action-level verification of independent permissions, readback command includes `--appends actions`
- for scope=`all|own`, readback shows non-null `scopeId` and matching scope key
- when field rules were omitted by user, full-field defaults were applied explicitly as non-empty field-name lists
- when full-field defaults are used, readback field lists match requested names and do not silently lose system fields
- command-level preflight blocks malformed independent-resource payloads before execution (missing/invalid `usingActionsConfig`, `actions`, scope binding `scopeId|scopeKey`, `fields`)
- `roles data-source-resources get|update` locator is explicit (`filterByTk` or `data-source-key + name`) before execution
- collection/field metadata is resolved through `resource collections` read path; `roles data-sources-collections list` is compatibility-only for role-facing view
- `roles desktop-routes add` uses JSON array body with numeric route ids
- no write executes with uncertain or type-mismatched parameters
- global role-mode tasks do not require `role_name`
- boundary messages are clear and actionable

# Minimal Test Scenarios

1. `global.role-mode.get` and `global.role-mode.set` with readback.
2. `role.create-blank` then verify role exists and has conservative defaults.
3. `permission.data-source.global.set` and verify strategy actions.
4. `permission.data-source.resource.set` with business collection name should auto-resolve real collection name(s) from target data source.
5. `permission.data-source.resource.set` with ambiguous collection match should ask for disambiguation before write.
6. `permission.data-source.resource.set` with missing actions should ask for clarification before write.
7. `permission.data-source.resource.set` with missing scope should default to `all`, show this in confirmation, and allow user override before write.
8. `permission.data-source.resource.set` with `view` and no field restrictions should apply full-field permission by default via explicit non-empty field lists.
9. `permission.data-source.resource.set` with scope=`all` should write explicit built-in scope binding (non-null `scopeId` for key=`all`).
10. `permission.data-source.resource.set` should require pre-write confirmation including data source + resolved collections + actions + scope.
11. `permission.data-source.resource.set` should write independent policy in one complete payload (`usingActionsConfig + actions + scope + fields`), not multi-step patching.
12. `user.assign-role` in strict mode should use dedicated membership command when available; if unavailable, block with boundary guidance.
13. `user.assign-role` guarded fallback should run only when dedicated command is unavailable and guarded mode is explicitly enabled.
14. `risk.assess-role` should return score + evidence + recommendations.
15. Full-field default should preserve system fields in readback when metadata includes them.
16. Wrong base-dir or missing runtime command cache must fail-closed with boundary message, not ad-hoc script fallback.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [references/intent-presets-v1.md](references/intent-presets-v1.md) | intent normalization and defaults | includes global role-mode wording |
| [references/intent-to-tool-map-v1.md](references/intent-to-tool-map-v1.md) | runtime command resolution | maps logical tasks to CLI command patterns |
| [references/execution-guard-template.md](references/execution-guard-template.md) | every ACL write task | fixed preflight command template for base-dir lock and fail-closed checks |
| [references/result-format-v1.md](references/result-format-v1.md) | output rendering | includes risk cards and capability path |
| [references/configuration.md](references/configuration.md) | ACL policy details | detailed data-source and scope guidance |
| [references/independent-permissions.md](references/independent-permissions.md) | resource-level permission writes | `usingActionsConfig + actions + fields + scope` complete-write policy |
| [tests/capability-test-plan.md](tests/capability-test-plan.md) | capability matrix | aligned with v2 domains |
| [tests/test-playbook.md](tests/test-playbook.md) | acceptance regression | prompt-first TC01, TC02, TC04-TC20 with runtime evidence commands |
| [references/refactor-plan-v2.md](references/refactor-plan-v2.md) | capability gaps and rollout plan | includes CLI migration notes |
| [tests/README.md](tests/README.md) | runtime verification | playbook execution flow and reporting notes |

# References

- [Intent Presets v1](references/intent-presets-v1.md)
- [Intent To Tool Map v1](references/intent-to-tool-map-v1.md)
- [Execution Guard Template](references/execution-guard-template.md)
- [Result Format v1](references/result-format-v1.md)
- [ACL Configuration Details](references/configuration.md)
- [Table Independent Permissions](references/independent-permissions.md)
- [ACL Capability Test Plan](tests/capability-test-plan.md)
- [ACL Test Playbook](tests/test-playbook.md)
- [ACL Refactor Plan v2](references/refactor-plan-v2.md)
- [ACL Capability Tests](tests/README.md)
- [NocoBase ACL Handbook](https://docs.nocobase.com/handbook/acl) [verified: 2026-04-11]
