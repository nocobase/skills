---
name: nocobase-acl-manage
description: Inspect and configure NocoBase ACL through MCP for roles, routes, snippets, table permissions, field permissions, and scopes. Use when users need to grant, restrict, audit, or debug role-based access.
argument-hint: "[task: inspect|role-create|role-update|default-role|role-mode|global-actions|resource-actions|scope-create|scope-update|audit|debug] [role_name?] [data_source_key?]"
allowed-tools: NocoBase MCP ACL tools (`roles:*`, `roles.desktopRoutes:*`, `roles.mobileRoutes:*`, `availableActions:list`, data-source role/resource scope tools)
owner: platform-tools
version: 1.1.0
last-reviewed: 2026-04-10
risk-level: medium
---

# Goal

Configure and debug NocoBase ACL safely through ACL-specific MCP interfaces. This skill covers role identity, default role, role union mode, system snippets, route permissions, global table strategy, collection-level independent permissions, field permissions, and row scopes.

# Scope

- Supports ACL inspection and mutation through ACL-specific MCP tools.
- Works layer by layer: role -> role mode -> snippets -> routes -> global table strategy -> independent permissions -> fields -> scopes.
- Requires explicit permission decisions for realistic business roles.
- Requires readback verification after every write.

# Non-Goals

- Do not perform ad hoc sign-in flows.
- Do not mutate ACL through generic `crud`.
- Do not inspect local source code or patch ACL tables directly.
- Do not bypass missing ACL MCP capabilities with alternative write paths.
- Do not treat data modeling work as part of ACL mutation, except for prerequisite checks.

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `task` | yes | none | one of `inspect`, `role-create`, `role-update`, `default-role`, `role-mode`, `global-actions`, `resource-actions`, `scope-create`, `scope-update`, `audit`, `debug` | "Which ACL task should run?" |
| `role_name` | conditional | none | required for role-specific mutation or role audit | "Which role should be targeted?" |
| `data_source_key` | conditional | `main` | must exist in `dataSources:list` before scope/resource mutation | "Which data source key should be used?" |
| `collections` | conditional | none | required when configuring independent permissions | "Which collections need independent permissions?" |
| `strict_mode` | no | `safe` | one of `safe` or `fast` | "Use safe mode with full readback, or fast mode?" |
| `output` | no | `text` | one of `text` or `text+matrix` | "Return concise text only, or include a permission matrix?" |

Default behavior when user says `you decide`:

- Default `task` is `inspect` if user intent is ambiguous.
- Default `data_source_key` is `main`.
- Default `strict_mode` is `safe`.
- Default `output` is `text+matrix` for mutation tasks and `text` for read-only tasks.

# Mandatory Clarification Gate

- Max clarification rounds: `2`.
- Max questions per round: `3`.
- Never run mutation when required input is missing.
- If `task` implies write and `role_name` is missing, stop and ask first.
- If scope/resource mutation is requested and `data_source_key` is unresolved, stop and ask first.
- If MCP returns errors such as `Auth required`, stop and ask the user to restore authentication.

# Workflow

1. Resolve intent and required input.
- Validate `task`, `role_name`, `data_source_key`, and target collections.
- Confirm the requested ACL layer is supported by current MCP interfaces.

2. Run the mandatory MCP gate before mutation.
- Check `roles:*`.
- Check route tools (`roles.desktopRoutes:*` or `roles.mobileRoutes:*`) when route work is needed.
- Check `availableActions:list` and role resource/scope tools when table ACL work is needed.
- If the target ACL layer has read-only coverage only, stop and report ACL MCP capability is insufficient.

3. Inspect baseline state.
- List roles and current role context.
- Inspect role mode (`default`, `allow-use-union`, `only-use-union`).
- Inspect snippets, route bindings, global table strategy, independent permissions, and scopes.
- Always list existing scopes first with `dataSources/{dataSourceKey}/roles.resourcesScopes:list`.

4. Build a permission matrix before write.
- Decide snippets, routes, global strategy, independent actions, field lists, and scopes.
- If any layer is intentionally empty, document why.
- For independent permissions, fetch collection fields first.

5. Mutate one ACL layer at a time.
- Role/default-role first.
- Role mode and snippets second.
- Route permissions third.
- Global table strategy fourth.
- Independent permissions fifth (`usingActionsConfig: true` only for exception collections).
- Field and scope restrictions last.

6. Enforce field and scope hard rules.
- Action names must come from `availableActions:list`.
- For actions that support field config (`create`, `view`, `update`, `export`, `importXlsx`), set `fields` explicitly.
- Empty `fields: []` is valid only when intentional full-field access is documented.
- For custom scopes, wrap conditions with `$and` or `$or` and use `scopeId` binding.

7. Run immediate readback after every write.
- Readback updated role, route binding, snippet set, resource action, or scope record.
- Verify expected action names, field lists, and `scopeId`.
- For scoped actions, verify both action `scopeId` and the scope record itself.
- Record at least one allowed case and one denied case in final verification.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [references/system-permissions.md](references/system-permissions.md) | configuring snippets and system boundaries | covers `ui.*`, `pm`, `pm.*`, `app` |
| [references/route-permissions.md](references/route-permissions.md) | configuring desktop/mobile page visibility | route ACL is independent from table ACL |
| [references/global-table-permissions.md](references/global-table-permissions.md) | setting broad table permissions | prefer before resource-level overrides |
| [references/independent-permissions.md](references/independent-permissions.md) | setting per-collection exceptions | includes mandatory field strategy |
| [references/field-permissions.md](references/field-permissions.md) | configuring read/create/update/export fields | relation mutation guidance included |
| [references/scopes.md](references/scopes.md) | configuring own/business row filters | check built-in scopes first |
| [references/safety-and-debug.md](references/safety-and-debug.md) | debugging ACL mismatch and middleware behavior | use for denied access investigations |
| [../nocobase-utils/references/filter/index.md](../nocobase-utils/references/filter/index.md) | writing custom scope filter JSON | canonical filter format |

# Safety Gate

High-impact actions:

- changing default role assignment for all new users
- enabling high-leverage snippets (`ui.*`, `pm`, `pm.*`, `app`)
- changing global table strategy for many collections
- applying broad scope or field restrictions that may block production flows

Safety rules:

- ACL mutation in this skill uses ACL MCP tools only.
- Never use `crud` for ACL, even if underlying tables are writable.
- Every mutation must include immediate readback and explicit diff notes.
- If capability is missing, stop and report the gap instead of bypassing.

Rollback guidance:

- If a mutation is incorrect, rollback by restoring the previous ACL state captured from readback.
- Re-apply the last known good values for role mode, snippets, routes, resource actions, and scopes.
- Run readback again after rollback to confirm correctness.

# Verification Checklist

- Target role exists and metadata matches expectation.
- Role mode matches intended multi-role behavior.
- System snippets match intended system capability boundaries.
- Route permissions match intended menu/page visibility.
- Global table strategy is configured or intentionally empty with reason.
- Exception collections use `usingActionsConfig: true` only when needed.
- Action names come from `availableActions:list`, not guesswork.
- Collection fields were fetched before independent permission writes.
- Field lists are explicit for actions that support field configuration.
- Empty `fields: []` is intentional and documented as full-field access.
- Existing scopes were listed before creating custom scopes.
- Built-in `own` is used only for creator-based own-record requirements.
- Custom scope filters are valid and wrapped by `$and` or `$or`.
- Scoped actions carry expected numeric `scopeId`.
- Immediate readback is completed after every write.
- Effective ACL is tested with one allowed and one denied case.

# Minimal Test Scenarios

1. Happy path: create a role with conservative snippets, then readback role metadata.
2. Happy path: configure one collection with independent permissions, fields, and scope, then readback actions and `scopeId`.
3. Failure path: missing required `role_name` for mutation must stop before write and ask clarification.
4. Failure path: invalid `scopeId` must fail verification and be reported as denied/invalid.
5. Auth/permission path: MCP returns `Auth required` or permission denial, and flow stops for recovery.

# References

- [ACL Configuration Details](references/configuration.md)
- [System Permissions](references/system-permissions.md)
- [Route Permissions](references/route-permissions.md)
- [Global Table Permissions](references/global-table-permissions.md)
- [Independent Permissions](references/independent-permissions.md)
- [Field Permissions](references/field-permissions.md)
- [Scopes](references/scopes.md)
- [Safety And Debug](references/safety-and-debug.md)
- [Filter Condition Format](../nocobase-utils/references/filter/index.md)
- [NocoBase ACL Handbook](https://docs.nocobase.com/handbook/acl) [verified: 2026-04-10]
