---
name: nocobase-acl-manage
description: Task-driven ACL operations through MCP for role onboarding, default role, system snippets, global strategy, and role audit. Use when users describe business permission goals instead of raw tool parameters.
argument-hint: "[task: onboard-role|set-default-role|set-system-snippets|set-global-actions|audit-role] [role_name?] [data_source_key?] [preset?]"
allowed-tools: NocoBase MCP ACL tools (`roles:*`, `availableActions:list`, `dataSources.roles:*`)
owner: platform-tools
version: 1.2.0
last-reviewed: 2026-04-10
risk-level: medium
---

# Goal

Turn ACL configuration into a task-driven workflow so users can ask for business outcomes, while the skill handles MCP tool selection, argument shaping, safety checks, and readback verification.

# Scope

- This skill is MCP-only for ACL writes and reads.
- This skill is task-driven: user intent first, tool details hidden.
- This skill currently targets capabilities verified by runner:
- `ACL-BASE-001` create role
- `ACL-BASE-003` set default role
- `ACL-SYS-001` to `ACL-SYS-005` system snippets
- `ACL-DS-001` global data-source strategy
- `ACL-SMOKE-001` protocol/tool gate
- Every write task runs `plan -> confirm -> apply -> readback`.

# Non-Goals

- Do not mutate ACL through generic `resource_*` CRUD tools.
- Do not call REST endpoints (`/api/*`) directly for ACL mutation.
- Do not bypass missing MCP capabilities with alternative write paths.
- Do not claim support for unverified scenarios in this skill version:
- bind user to role (`ACL-BASE-002`)
- collection-level independent strategy (`ACL-DS-002`)
- scope lifecycle / fine-grained field permissions in automated write mode

# Task Model

| Task | User Outcome | Required Inputs | Optional Inputs |
|---|---|---|---|
| `onboard-role` | create a role with business-ready baseline policy | `role_name` | `role_title`, `snippet_preset`, `snippets`, `global_actions`, `data_source_key`, `set_default` |
| `set-default-role` | change default role for new users | `role_name` | none |
| `set-system-snippets` | update role-level system snippets | `role_name`, (`snippet_preset` or `snippets`) | none |
| `set-global-actions` | update role global table actions in one data source | `role_name`, `global_actions` | `data_source_key` |
| `audit-role` | inspect effective role policy and return readable summary | `role_name` | `data_source_key`, `output` |

Legacy task aliases remain accepted:

- `role-create` -> `onboard-role`
- `default-role` -> `set-default-role`
- `global-actions` -> `set-global-actions`
- `inspect` or `audit` -> `audit-role`
- `role-update` -> `set-system-snippets` when intent only changes snippets

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `task` | yes | none | one of task model values | "Which ACL task should run?" |
| `role_name` | conditional | none | required for all tasks except pure discovery | "Which role should be targeted?" |
| `role_title` | no | use `role_name` | string 1-128 | "What display title should this role use?" |
| `snippet_preset` | conditional | `minimal-ui` | one of presets in `intent-presets-v1` | "Which snippet preset should be used?" |
| `snippets` | conditional | none | array of snippet keys | "Which exact snippets should be set?" |
| `global_actions` | conditional | none | array of ACL action strings | "Which global actions should be granted?" |
| `data_source_key` | no | `main` | must exist in `dataSources:list` | "Which data source key should be used?" |
| `set_default` | no | `false` | boolean | "Should this role become default for new users?" |
| `strict_mode` | no | `safe` | one of `safe` or `fast` | "Use safe mode with full readback, or fast mode?" |
| `output` | no | `text+matrix` | one of `text`, `text+matrix`, `text+evidence` | "How detailed should the result be?" |

Default behavior when user says `you decide`:

- `task=onboard-role` if user requests creation or setup
- `task=audit-role` if user intent is read-only
- `data_source_key=main`
- `strict_mode=safe`
- `snippet_preset=minimal-ui` for onboarding when no snippet intent is given

# Mandatory Clarification Gate

- Max clarification rounds: `2`.
- Max questions per round: `3`.
- Never execute writes until required task inputs are complete.
- If both `snippet_preset` and `snippets` are provided, use explicit `snippets`.
- If task implies writes and role input is missing, stop and ask first.
- If MCP returns auth errors (`Auth required`, `401`, permission denied), stop and request recovery before retry.

# Workflow

1. Resolve task intent.
- Normalize task aliases to canonical task names.
- Convert business language to structured task input using preset definitions.

2. Run MCP capability gate.
- Must confirm `tools/list` and `tools/call` availability.
- Resolve runtime tool names via `intent-to-tool-map-v1`.
- Reject direct raw methods like `resource_update`.

3. Produce a task plan before writes.
- Return what will be changed, what will be read back, and risk impact.
- For high-impact writes, require explicit confirmation.

4. Execute one task at a time.
- `onboard-role`: create role -> set snippets -> optionally set global actions -> optionally set default role.
- `set-default-role`: write default role only.
- `set-system-snippets`: write snippets only.
- `set-global-actions`: write data-source global strategy only.
- `audit-role`: read role profile, snippets, mode hints, and data-source strategy.

5. Readback verification after each write.
- Verify role exists and expected fields changed.
- Verify snippets exactly match requested set when task is snippet-focused.
- Verify global strategy action set includes requested actions.
- Verify default role switch through readback endpoint/tool.

6. Report in task format.
- Use output template from `result-format-v1`.
- Include user-friendly boundary guidance when unsupported scenarios are requested.

# Task-To-Tool Execution Matrix

| Task | Primary Write Tools | Primary Readback Tools |
|---|---|---|
| `onboard-role` | `roles_create`, `roles_update`, `data_sources_roles_update`, `roles_set_default_role` | `roles_get`, `data_sources_roles_get` |
| `set-default-role` | `roles_set_default_role` | `roles_list` or `roles_get` |
| `set-system-snippets` | `roles_update` | `roles_get` |
| `set-global-actions` | `data_sources_roles_update` | `data_sources_roles_get` |
| `audit-role` | none | `roles_get`, `roles_list`, `data_sources_roles_get`, `available_actions_list` |

Tool names above are logical names. Runtime names are resolved from tool list at execution time.

# Capability Boundary Messaging

When a user asks for a scenario not supported through current MCP coverage:

- State the boundary clearly and politely.
- Do not expose only low-level protocol errors.
- Recommend practical next steps in NocoBase admin UI.
- Offer to provide click-path instructions.

Preferred Chinese wording:

- `该场景当前暂不支持通过 MCP 完成。建议先在 NocoBase 管理页面中处理该权限配置。`
- `如你愿意，我可以继续给你列出页面操作步骤（入口位置 + 字段填写建议）。`

Preferred English wording:

- `This scenario is not currently supported through MCP. Please complete it in the NocoBase admin UI.`
- `If you want, I can provide exact UI navigation steps and field suggestions.`

# Safety Gate

High-impact actions:

- changing default role for all new users
- enabling broad system snippets (`ui.*`, `pm`, `pm.*`, `app`)
- granting broad global actions in production data sources

Safety rules:

- ACL writes in this skill must use MCP `tools/call` with ACL-specific tools.
- Never fallback to direct HTTP or database operations.
- Always attach readback evidence after write.
- If capability is missing, stop and apply capability boundary messaging.

# Verification Checklist

- Task intent is normalized to a canonical task.
- Required inputs for chosen task are complete before writes.
- MCP gate passes (`initialize`, `tools/list`, `tools/call`).
- Runtime tool names are resolved before execution.
- Every write has immediate readback evidence.
- Output follows task format (summary, changes, evidence, next action).
- Unsupported scenarios use friendly MCP boundary message with UI guidance.

# Minimal Test Scenarios

1. `onboard-role` with preset snippets, then read back role and snippets.
2. `set-default-role` and verify readback.
3. `set-global-actions` on `main`, then verify strategy actions by readback.
4. `audit-role` returns readable matrix without mutation.
5. Unsupported request (`bind user to role`) triggers capability boundary messaging and UI suggestion.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [references/intent-presets-v1.md](references/intent-presets-v1.md) | mapping business intents to ACL presets | task-driven defaults and preset bundles |
| [references/intent-to-tool-map-v1.md](references/intent-to-tool-map-v1.md) | resolving task to MCP tools and argument shape | includes runtime name fallback strategy |
| [references/result-format-v1.md](references/result-format-v1.md) | rendering user-facing task results | standard output blocks and wording |
| [references/system-permissions.md](references/system-permissions.md) | selecting snippet boundaries | snippet semantics |
| [references/global-table-permissions.md](references/global-table-permissions.md) | global strategy semantics | action design guidance |
| [references/mcp-tool-shapes.md](references/mcp-tool-shapes.md) | canonical MCP payload patterns | `tools/call` envelope rules |
| [tests/README.md](tests/README.md) | running capability checks | contract and runtime validation |

# References

- [Intent Presets v1](references/intent-presets-v1.md)
- [Intent To Tool Map v1](references/intent-to-tool-map-v1.md)
- [Result Format v1](references/result-format-v1.md)
- [ACL Configuration Details](references/configuration.md)
- [System Permissions](references/system-permissions.md)
- [Global Table Permissions](references/global-table-permissions.md)
- [ACL MCP Tool Shapes](references/mcp-tool-shapes.md)
- [ACL Capability Test Plan](references/capability-test-plan.md)
- [ACL MCP Capability Runner](tests/README.md)
- [NocoBase ACL Handbook](https://docs.nocobase.com/handbook/acl) [verified: 2026-04-10]
