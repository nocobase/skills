---
name: nocobase-acl-manage
description: Inspect and configure NocoBase roles, system permissions, route permissions, table global permissions, table independent permissions, field permissions, and row scopes via MCP. Use when users want to grant, restrict, debug, or audit ACL behavior in a NocoBase app.
argument-hint: "[task: inspect|role-create|role-update|default-role|role-mode|global-actions|resource-actions|scope-create|scope-update|audit|debug]"
allowed-tools: All MCP tools provided by NocoBase server
---

# Goal

Configure and diagnose NocoBase ACL safely through MCP: roles, default role, role union mode, system permission snippets, route permissions, data-source-level global table strategy, collection-level independent permissions, field permissions, and row scopes.

# Prerequisite

- NocoBase MCP must already be authenticated before permission operations.
- If MCP tools return authentication errors such as `Auth required`, do not attempt ad hoc sign-in flows.
- Stop and ask the user to restore MCP authentication first.

Useful references:

- MCP setup: `nocobase-mcp-setup`
- Roles and permissions handbook: https://docs.nocobase.com/handbook/acl
- Data modeling handbook: https://docs.nocobase.com/data-sources/data-modeling
- Full docs index used for ACL terminology: https://docs.nocobase.com/llms-full.txt

# ACL Model

Think in layers. Configure from identity to business access:

1. Role identity
2. System role mode
3. System permissions
4. Route permissions
5. Global table permissions
6. Table independent permissions
7. Row and field restrictions

Do not jump into table independent permissions until system, route, and global table intent are clear.
Do not stop at action-only skeletons when the user asks for a realistic business role. A realistic role usually needs an explicit decision for every relevant layer, even when that decision is "leave empty".

# What To Read

- For normal permission configuration, read the dimension-specific references you actually need:
  - [references/system-permissions.md](references/system-permissions.md)
  - [references/route-permissions.md](references/route-permissions.md)
  - [references/global-table-permissions.md](references/global-table-permissions.md)
  - [references/independent-permissions.md](references/independent-permissions.md)
  - [references/field-permissions.md](references/field-permissions.md)
  - [references/scopes.md](references/scopes.md)
- For debugging access mismatches or understanding middleware/security behavior, read [references/safety-and-debug.md](references/safety-and-debug.md).

# Mandatory MCP Gate

Before mutation, confirm the ACL-related MCP tools are reachable:

- `roles:*`
- route permission tools such as `roles.desktopRoutes:*` or `roles.mobileRoutes:*`
- `availableActions:list`
- role collection/resource permission tools
- scope tools

If the swagger-generated tools are incomplete, fall back to the generic CRUD tool only after inspecting the relevant collection/resource metadata first.

# Preferred Order

1. Inspect current state first.
   - List roles.
   - Check current role context and system role mode.
   - Inspect current system snippets if system capability matters.
   - Inspect current route permissions if menu access matters.
   - List available ACL actions.
   - Read data-source global strategy if table access matters.
   - List collections visible in role permissions.
   - Inspect existing scopes if the task mentions own-record or custom data ranges.
2. Change one layer at a time.
   - Role or default role first.
   - Then system role mode if needed.
   - Then system permissions.
   - Then route permissions.
   - Then global table permissions.
   - Then table independent permissions.
   - Then scopes and field restrictions.
3. Verify with real ACL metadata after every write.
   - Re-read the updated role, route binding, or resource permission record.
   - Re-check the current role context when union mode or default role is involved.
4. Prefer a complete permission matrix before writing.
   - For each role, decide system snippets, route bindings, global table strategy, independent collection actions, field lists, and row scopes.
   - If a layer is intentionally left empty, record why it is empty instead of silently skipping it.

# Verification Checklist

- The target role exists and has the expected metadata.
- The system role mode matches the intended multi-role behavior.
- System snippets match the intended system capability boundary.
- Route permissions match the intended menu/page boundary.
- The global role strategy matches the broad table-level business rules.
- Only the collections that need exceptions use `usingActionsConfig: true`.
- Action names come from `availableActions:list`, not guesswork.
- Field restrictions are only configured on actions that support field configuration.
- Scoped actions carry the expected `scopeId`.
- Scope definitions are re-read separately and their filters reference real fields and real relation paths.
- Business scopes are created under the target data source, not in global `rolesResourcesScopes`.
- Collections using own-record semantics have the necessary ownership fields.
- Association mutation permissions are explicitly covered where needed.
- For realistic business roles, the final config includes an explicit decision for system permissions, route permissions, global permissions, independent permissions, field permissions, and scopes.
- Empty global strategy is intentional and justified, not accidental.
- Empty scope means "full-row access by design", not "scope was forgotten".
- Field lists are configured where field visibility or mutation boundaries matter, especially on update/create/view/export.
- Effective access is tested on at least one allowed case and one denied case.
