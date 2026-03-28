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

**CRITICAL: Field permissions are mandatory for independent permissions.**
- When configuring independent permissions (`usingActionsConfig: true`), you MUST explicitly configure field lists for actions that support field configuration (create, view, update, export).
- Empty `fields: []` means "no field restrictions" (full access), not "unconfigured".
- For realistic business roles, always decide and document which fields each action can access.
- If you intentionally want full field access, explicitly state this decision and why.

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

ACL configuration in this skill must use ACL-specific MCP interfaces only.
Do not use local code inspection, repository source reading, or generic CRUD as a substitute path for ACL mutation.
If the currently exposed ACL MCP interfaces are insufficient for the requested ACL change, stop and state that the ACL MCP capability is insufficient for the task instead of bypassing it.

Hard rules:

- ACL work in this skill only allows MCP interfaces exposed by the NocoBase server for ACL itself.
- Never use `crud` for ACL, even if `crud` could technically write the same underlying tables.
- Never inspect local source code to infer or patch ACL behavior.
- Use only the ACL-specific interfaces that actually exist in MCP. Do not assume hidden or equivalent write paths.
- If a target ACL layer has read-only MCP coverage but no ACL-specific mutation interface, stop at that layer and report the gap directly.

# Preferred Order

1. Inspect current state first.
   - List roles.
   - Check current role context and system role mode.
   - Inspect current system snippets if system capability matters.
   - Inspect current route permissions if menu access matters.
   - List available ACL actions.
   - Read data-source global strategy if table access matters.
   - List collections visible in role permissions.
   - **Get collection field lists** for collections that will use independent permissions.
   - **ALWAYS list existing scopes first** using `dataSources/{dataSourceKey}/roles.resourcesScopes:list` to check for built-in scopes (`all`, `own`) before creating custom scopes.
2. Change one layer at a time.
   - Role or default role first.
   - Then system role mode if needed.
   - Then system permissions.
   - Then route permissions.
   - Then global table permissions.
   - Then table independent permissions **with field lists**.
   - Then scopes and field restrictions.
3. Verify with real ACL metadata after every write.
   - Re-read the updated role, route binding, or resource permission record.
   - Re-check the current role context when union mode or default role is involved.
4. Prefer a complete permission matrix before writing.
   - For each role, decide system snippets, route bindings, global table strategy, independent collection actions, **field lists**, and row scopes.
   - If a layer is intentionally left empty, record why it is empty instead of silently skipping it.
   - **For independent permissions, always fetch collection fields first, then decide which fields each action can access.**

# Verification Checklist

- The target role exists and has the expected metadata.
- The system role mode matches the intended multi-role behavior.
- System snippets match the intended system capability boundary.
- Route permissions match the intended menu/page boundary.
- The global role strategy matches the broad table-level business rules.
- Only the collections that need exceptions use `usingActionsConfig: true`.
- Action names come from `availableActions:list`, not guesswork.
- **Field permissions checklist (MANDATORY for independent permissions):**
  - Collection fields were fetched before configuring independent permissions.
  - For each action that supports field configuration (create, view, update, export), field lists are explicitly configured.
  - Empty `fields: []` is intentional and documented (means "no field restrictions").
  - Sensitive fields (financial, identity, status, approval) have appropriate restrictions.
  - Relation fields are configured based on whether the role should be able to change associations.
  - Field configuration decisions are documented (which fields, why, and for which actions).
- **Scope usage checklist:**
  - Built-in scopes were checked first before creating custom scopes.
  - For "own records" requirements, the built-in `own` scope is used (not a custom scope).
  - Custom scopes are only created when built-in scopes cannot satisfy the requirement.
  - Scoped actions carry the expected `scopeId` (the actual numeric ID from scopes list).
  - Scope definitions are re-read separately and their filters reference real fields and real relation paths.
  - Business scopes are created under the target data source, not in global `rolesResourcesScopes`.
  - Collections using own-record semantics have the necessary ownership fields (`createdBy`, `createdById`).
- Association mutation permissions are explicitly covered where needed.
- For realistic business roles, the final config includes an explicit decision for system permissions, route permissions, global permissions, independent permissions, field permissions, and scopes.
- Empty global strategy is intentional and justified, not accidental.
- Empty scope means "full-row access by design", not "scope was forgotten".
- Effective access is tested on at least one allowed case and one denied case.
