# ACL Intent To Tool Map v1

This document maps task-driven ACL intents to MCP tool operations.

All calls must use MCP `tools/call` envelopes.

## Runtime Name Resolution

Use tool aliases because runtime tool names may vary by version.

| Logical Tool | Preferred Names | Regex Fallback |
|---|---|---|
| `roles_create` | `roles_create` | `^roles_.*create$` |
| `roles_get` | `roles_get` | `^roles_.*get$` |
| `roles_list` | `roles_list` | `^roles_.*list$` |
| `roles_update` | `roles_update` | `^roles_.*update$` |
| `roles_set_default_role` | `roles_set_default_role`, `roles_set_default` | `^roles_.*default.*(set|update)$` |
| `data_sources_roles_update` | `data_sources_roles_update` | `^data_.*sources_.*roles_.*update$` |
| `data_sources_roles_get` | `data_sources_roles_get` | `^data_.*sources_.*roles_.*get$` |
| `available_actions_list` | `available_actions_list` | `^available_.*actions_.*list$` |

## Task Execution Map

### `onboard-role`

1. Create role with `roles_create`
2. If snippets requested, update role with `roles_update`
3. If global actions requested, write strategy with `data_sources_roles_update`
4. If `set_default=true`, run `roles_set_default_role`
5. Readback with `roles_get` and optional `data_sources_roles_get`

#### Example argument shape (logical)

```json
{
  "roles_create": {
    "requestBody": {
      "name": "sales_manager",
      "title": "Sales Manager"
    }
  },
  "roles_update_snippets": {
    "filterByTk": "sales_manager",
    "requestBody": {
      "snippets": ["ui.*"]
    }
  },
  "data_sources_roles_update": {
    "dataSourceKey": "main",
    "filterByTk": "sales_manager",
    "requestBody": {
      "roleName": "sales_manager",
      "dataSourceKey": "main",
      "strategy": {
        "actions": ["view", "create", "update"]
      }
    }
  }
}
```

### `set-default-role`

1. Write with `roles_set_default_role`
2. Readback with `roles_list` or `roles_get`

### `set-system-snippets`

1. Write snippets with `roles_update`
2. Readback snippets with `roles_get`

### `set-global-actions`

1. Write data source strategy with `data_sources_roles_update`
2. Readback with `data_sources_roles_get`

### `audit-role`

1. Read `roles_get`
2. Read `data_sources_roles_get` (optional if role has data source strategy)
3. Read `available_actions_list` for action glossary

## Validation Rules

- Never execute task writes if required logical tools cannot be resolved.
- Never use raw JSON-RPC methods like `resource_update`.
- Never fallback to direct HTTP if tool resolution fails.

## Unsupported Intent Rules

If intent requires missing capability (for example role-user binding), stop and return boundary guidance:

- `该场景当前暂不支持通过 MCP 完成。建议先在 NocoBase 管理页面中处理该权限配置。`
