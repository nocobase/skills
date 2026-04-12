# ACL Intent To Tool Map v1

This reference maps canonical tasks to MCP tools for `nocobase-acl-manage` v2.

All calls must use MCP `tools/call`.

## Runtime Name Resolution

Use logical names first, then runtime fallback patterns.

| Logical Tool | Preferred Names | Regex Fallback |
|---|---|---|
| `roles_list` | `roles_list` | `^roles_.*list$` |
| `roles_get` | `roles_get` | `^roles_.*get$` |
| `roles_create` | `roles_create` | `^roles_.*create$` |
| `roles_update` | `roles_update` | `^roles_.*update$` |
| `roles_destroy` | `roles_destroy` | `^roles_.*destroy$` |
| `roles_set_default_role` | `roles_set_default_role` | `^roles_.*default.*(set|update)$` |
| `roles_set_system_role_mode` | `roles_set_system_role_mode` | `^roles_.*system_.*role_.*mode$` |
| `roles_check` | `roles_check` | `^roles_.*check$` |
| `available_actions_list` | `available_actions_list` | `^available_.*actions_.*list$` |
| `data_sources_roles_get` | `data_sources_roles_get` | `^data_.*sources_.*roles_.*get$` |
| `data_sources_roles_update` | `data_sources_roles_update` | `^data_.*sources_.*roles_.*update$` |
| `roles_data_sources_collections_list` | `roles_data_sources_collections_list` | `^roles_.*data_.*sources_.*collections_.*list$` |
| `roles_data_source_resources_get` | `roles_data_source_resources_get` | `^roles_.*data_.*source_.*resources_.*get$` |
| `roles_data_source_resources_create` | `roles_data_source_resources_create` | `^roles_.*data_.*source_.*resources_.*create$` |
| `roles_data_source_resources_update` | `roles_data_source_resources_update` | `^roles_.*data_.*source_.*resources_.*update$` |
| `roles_desktop_routes_list` | `roles_desktop_routes_list` | `^roles_.*desktop_.*routes_.*list$` |
| `roles_desktop_routes_set` | `roles_desktop_routes_set` | `^roles_.*desktop_.*routes_.*set$` |
| `roles_desktop_routes_add` | `roles_desktop_routes_add` | `^roles_.*desktop_.*routes_.*add$` |
| `roles_desktop_routes_remove` | `roles_desktop_routes_remove` | `^roles_.*desktop_.*routes_.*remove$` |
| `roles_resources_scopes_list` | `roles_resources_scopes_list` | `^roles_.*resources_.*scopes_.*list$` |
| `roles_resources_scopes_get` | `roles_resources_scopes_get` | `^roles_.*resources_.*scopes_.*get$` |
| `data_sources_roles_resources_scopes_list` | `data_sources_roles_resources_scopes_list` | `^data_.*sources_.*roles_.*resources_.*scopes_.*list$` |
| `data_sources_roles_resources_scopes_create` | `data_sources_roles_resources_scopes_create` | `^data_.*sources_.*roles_.*resources_.*scopes_.*create$` |
| `data_sources_roles_resources_scopes_update` | `data_sources_roles_resources_scopes_update` | `^data_.*sources_.*roles_.*resources_.*scopes_.*update$` |
| `data_sources_roles_resources_scopes_destroy` | `data_sources_roles_resources_scopes_destroy` | `^data_.*sources_.*roles_.*resources_.*scopes_.*destroy$` |
| `resource_list` | `resource_list` | `^resource_.*list$` |
| `resource_get` | `resource_get` | `^resource_.*get$` |
| `resource_update` | `resource_update` | `^resource_.*update$` |

## Domain Execution Map

## A) Role Domain

### `role.audit-all`

1. `roles_list`
2. for each role: `roles_get`
3. optional per role: `data_sources_roles_get`
4. optional compare blocks: `roles_data_source_resources_get`

### `role.create-blank`

1. `roles_create` with conservative payload
2. `roles_get` readback

Conservative baseline payload:

```json
{
  "requestBody": {
    "name": "sales_reader",
    "title": "Sales Reader",
    "description": "Blank role baseline",
    "hidden": false,
    "allowConfigure": false,
    "allowNewMenu": false,
    "snippets": ["!ui.*", "!pm", "!pm.*", "!app"],
    "strategy": { "actions": [] }
  }
}
```

### `role.compare`

1. `roles_get` for each target role
2. `data_sources_roles_get` for each role in target data source
3. optional `roles_data_sources_collections_list` and `roles_data_source_resources_get`

## B) Global Role-Mode Domain

Important: this is global configuration, not a per-role field.

### `global.role-mode.get`

1. `roles_check`
2. read `roleMode` from payload

### `global.role-mode.set`

1. `roles_set_system_role_mode` with `requestBody.roleMode`
2. `roles_check` readback verify mode string

Example:

```json
{
  "name": "roles_set_system_role_mode",
  "arguments": {
    "requestBody": {
      "roleMode": "allow-use-union"
    }
  }
}
```

## C) Permission Domain

### `permission.system-snippets.set`

1. `roles_update` (`requestBody.snippets`)
2. `roles_get` readback

### `permission.route.desktop.set`

1. choose one write tool by intent: `roles_desktop_routes_set` or `add` or `remove`
2. `roles_desktop_routes_list` readback

### `permission.data-source.global.set`

1. `data_sources_roles_update`
2. `data_sources_roles_get` readback

### `permission.data-source.resource.set`

Required planning inputs before write:

1. data source key (`data_source_key`, default `main`)
2. collection hint(s) from user (`collection_hint` or `collection_hints[]`)
3. action list
4. data scope (`all` or `own` or `custom`)
5. resolved collection names (`resolved_collection_names[]`)
6. resolved scope binding (`resolved_scope_id` / `resolved_scope_key`)
7. resolved full-field list for field-configurable actions (`resolved_field_names_by_action`)

Resolution policy:

- user input may be business-facing names, not exact technical collection names
- distinguish operation wording from ACL action wording:
  - do not infer ACL action `create` from generic phrases like `add table permission`
  - infer ACL actions only from explicit capability wording (`can create/view/update/export/import`)
- resolve by listing collections in the selected data source and matching hints
- if any hint maps to multiple collections, ask user to choose
- if any hint has no matches, ask user for clearer input
- resolve scope through `data_sources_roles_resources_scopes_list`:
  - `all` -> row with `key=all`
  - `own` -> row with `key=own`
  - `custom` -> user-selected scope id/key
- do not write until resolved collections are explicitly confirmed

Execution chain:

1. `roles_data_sources_collections_list` (with `filter.dataSourceKey`) to fetch collections in selected data source
2. `data_sources_roles_resources_scopes_list` to resolve built-in/custom scope binding for selected scope mode
3. resolve hints into concrete collection names
4. resolve full-field defaults from collection metadata when user did not provide field restrictions
5. show pre-write confirmation summary: data source + resolved collections + actions + scope + resolved scope binding + field policy
6. `roles_data_source_resources_get` (for each resolved collection, if exists)
7. `roles_data_source_resources_create` or `roles_data_source_resources_update` (for each resolved collection)
8. `roles_data_source_resources_get` readback (for each resolved collection)

Write payload rule for scoped actions:

```json
{
  "requestBody": {
    "dataSourceKey": "main",
    "name": "orders",
    "usingActionsConfig": true,
    "actions": [
      { "name": "view", "fields": ["id", "orderNo", "status", "createdAt"], "scopeId": 1 }
    ]
  }
}
```

- For scope mode `all|own|custom`, each scoped action must bind non-null `scopeId`.
- Do not rely on implicit/null scope when user selected a concrete scope mode.
- For full-field defaults, each field-configurable action must carry an explicit non-empty field-name array.
- Do not use `fields: []` as a default-all marker.

Default field rule for resource actions:

- if user does not provide field restrictions, use full-field permission for each selected action
- for `view`, default to full-field permission on the target collection
- full-field defaults must be written as explicit non-empty field-name arrays resolved from collection metadata

### `permission.scope.manage`

1. `data_sources_roles_resources_scopes_list/get/create/update/destroy`
2. readback after each mutation

## D) User Domain

Default policy: do not use generic tools for ACL writes.

### strict path (`allow_generic_association_write=false`)

- if no dedicated role-user write tool is available, return boundary message

### guarded fallback path (`allow_generic_association_write=true`)

Allowed only for `users.roles` membership updates:

- assign role:

```json
{
  "name": "resource_update",
  "arguments": {
    "resource": "users",
    "filterByTk": 1,
    "values": {
      "roles": [{ "name": "sales_reader" }]
    },
    "updateAssociationValues": ["roles"]
  }
}
```

- readback:

```json
{
  "name": "resource_list",
  "arguments": {
    "resource": "users.roles",
    "sourceId": 1
  }
}
```

or

```json
{
  "name": "resource_list",
  "arguments": {
    "resource": "roles.users",
    "sourceId": "sales_reader"
  }
}
```

Runtime caveat:

- On current backend/runtime, `resource_update` for `users.roles` may return `statusCode=500` with `list.filter is not a function`.
- Treat guarded fallback as conditional capability until backend fix or dedicated ACL membership tools are available.

## E) Risk Domain

Risk tasks are computed by combining read APIs:

1. `roles_list` and `roles_get`
2. `roles_check` (global role mode and effective context)
3. `available_actions_list`
4. `data_sources_roles_get`
5. optional `roles_data_source_resources_get` and scope tools
6. membership reads via `resource_list(users.roles)` or `resource_list(roles.users)`

## Validation Rules

- resolve all required logical tools before write operations
- for `roles_data_sources_collections_list`, always include `filter.dataSourceKey`
- for scope=`all|own`, require non-null scope binding in write payload (`scopeId` or equivalent relation binding)
- for field-configurable actions with default-all behavior, require explicit non-empty `fields` arrays in write payload
- if user asks for `all permissions`, expanded runtime action set must be shown and confirmed before write
- do not execute `permission.data-source.resource.set` writes until resolved collections are confirmed by user
- never execute guarded fallback path unless explicitly enabled
- every write must have readback evidence

## Unsupported / Blocked Rules

If strict policy blocks a request:

- `This operation is blocked by current governance policy in this skill.`
- `If you want, enable guarded fallback for user-role membership updates, or finish in NocoBase admin UI.`
