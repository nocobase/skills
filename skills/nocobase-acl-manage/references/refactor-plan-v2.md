# ACL Manage Skill Refactor Plan (v2)

Last updated: 2026-04-11

## 1. Requirement Consolidation

This skill is refactored into four business domains:

- Role domain
  - `role.audit-all`
  - `role.create-blank`
  - `role.compare`
- Permission domain
  - `permission.system-snippets.set`
  - `permission.data-source.global.set`
  - `permission.data-source.resource.set`
  - `permission.route.desktop.set`
  - `permission.scope.manage`
- User domain
  - `user.assign-role`
  - `user.unassign-role`
  - `user.audit-role-membership`
- Risk domain
  - `risk.assess-role`
  - `risk.assess-user`
  - `risk.assess-system`

Global role mode is treated as a separate global policy axis and is not attached to a single role:

- `global.role-mode.get`
- `global.role-mode.set`

Role creation interaction requirement:

- use a single creation mode: default read-only baseline (`role.create-blank`)
- do not ask users to pick role archetypes first
- create first, then ask which permissions to assign

Resource permission interaction requirement:

- before `permission.data-source.resource.set`, collect required inputs:
- data source (`data_source_key`, default `main`, user may override)
- collection hint(s) from user (business names are allowed; exact technical names are not required)
- action list
- data scope
- resolved collection names (resolved from selected data source collection list)
- resolved scope binding (`scopeId`/scope key, especially for built-in `all` and `own`)
- if any is missing/unresolved, clarify first and block writes
- if collection matching is ambiguous, ask user to choose from candidates
- if collection matching fails, ask user for clearer keywords
- before write, confirm final plan: data source + resolved collections + actions + scope
- field policy default: all fields for selected actions (including `view`) unless user explicitly restricts fields
- implement default-all with explicit non-empty field-name arrays resolved from collection metadata (do not use `fields: []`)
- when scope is `all` or `own`, write payload must include explicit scope binding (non-null `scopeId`)

## 2. MCP + Source Capability Mapping

Validated against runtime MCP (`/api/mcp`) and NocoBase source.

### 2.1 Capabilities that are currently available

- Protocol and tool discovery
  - `initialize`, `tools/list`, `tools/call`
- Global role mode
  - read: `roles_check`
  - write: `roles_set_system_role_mode`
  - source evidence:
    - `plugin-acl/src/server/actions/role-check.ts`
    - `plugin-acl/src/server/actions/union-role.ts`
- Role and permission baseline
  - `roles_create`, `roles_get`, `roles_update`, `roles_destroy`
  - `data_sources_roles_update`, `data_sources_roles_get`
  - `roles_data_source_resources_create/get/update`
  - `roles_data_sources_collections_list` (requires `filter.dataSourceKey`)
  - source evidence:
    - `plugin-data-source-manager/src/server/resourcers/data-sources-roles.ts`
    - `plugin-data-source-manager/src/server/resourcers/data-sources-resources.ts`
    - `plugin-data-source-manager/src/server/resourcers/roles-data-sources-collections.ts`
- Desktop route permissions
  - `roles_desktop_routes_add/set/list/remove`
  - source evidence:
    - `plugin-client/src/swagger/index.ts`
    - `plugin-client/src/server/server.ts`

### 2.2 Capabilities that are partial or constrained

- User-role write path
  - no dedicated MCP tool like `roles_users_add` or `users_roles_add` in current runtime tool list.
  - strict governance path must block direct assignment in this case.
- Guarded fallback path (`resource_update` for `users.roles`)
  - runtime returns server-side error in current environment:
    - `statusCode=500`
    - message: `list.filter is not a function`
  - this means guarded write path is currently not reliable.
- Data-source resource update semantics
  - `roles_data_source_resources_update` does not create resource record when absent.
  - must fallback to `roles_data_source_resources_create` then readback.

### 2.3 Explicit unsupported items (current state)

- Stable MCP-first user-role assignment through dedicated ACL tooling.
- Guaranteed generic fallback for user-role assignment without backend fix.

## 3. Refactor Execution Plan

### Phase A: Skill Contract Hardening

- Keep canonical tasks grouped by domain and global role mode.
- Keep high-impact write gating:
  - global role mode writes
  - broad strategy/snippet writes
  - batch user assignment
- Keep strict default for user-domain writes when no dedicated tool exists.

### Phase B: Tool Resolution and Argument Policy

- Maintain logical-to-runtime mapping in `intent-to-tool-map-v1.md`.
- Keep schema-conform argument shaping.
- Enforce `roles_data_sources_collections_list` with `filter.dataSourceKey`.
- add collection hint resolution policy (business-name input -> concrete collection names).
- add mandatory pre-write confirmation for resource permission writes.
- Keep MCP-only policy; no direct REST fallback.

### Phase C: Capability Runner and Evidence

- `tests/run-acl-mcp-capability.js` verifies:
  - role/global/permission/user/risk domains
  - safety switches and readback checks
  - cleanup behavior
- include optional guarded-user-write switch:
  - `--enable-guarded-user-writes`

### Phase D: User-domain Gap Closure (Backend dependency)

Need one of the following before enabling user assignment as default write capability:

- Option 1 (preferred): add dedicated ACL membership MCP tools
  - e.g. `roles_users_add/remove` or `users_roles_add/remove`
- Option 2: fix generic association update behavior for `users.roles`
  - ensure deterministic payload shape and stable server behavior
  - verify with MCP runner `ACL-USER-002` pass

## 4. Current Execution Status

Completed in this round:

- v2 skill docs updated to four-domain + global-mode model
- capability matrix/test docs aligned
- capability runner completed and executable
- runtime validation executed in three modes:
  - safe read/contract mode (`--skip-writes`)
  - normal write mode (without high-impact global mode writes)
  - guarded user write probe mode

Observed stable gap:

- `ACL-USER-002` fails in guarded probe mode due backend error (`list.filter is not a function`).

## 5. Next Actions

- Keep `user.assign-role` and `user.unassign-role` in strict-block mode by default.
- Track backend issue for `resource_update(users.roles)` or introduce dedicated ACL membership tools.
- After backend fix, rerun capability runner and require pass for:
  - `ACL-USER-002`
  - `ACL-USER-003` (with write-readback pair)

