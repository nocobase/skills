# ACL MCP Tool Shapes

Use this file when ACL mutation fails because tool names or argument structures are uncertain.

## Mandatory Contract

1. Execute ACL tools through JSON-RPC method `tools/call`.
2. Do not call raw methods such as `resource_update` for ACL mutation.
3. Always validate runtime tool names with `tools/list` first.

Canonical envelope:

```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "tools/call",
  "params": {
    "name": "<acl_tool_name>",
    "arguments": {}
  }
}
```

## Common ACL Calls

### `roles_list`

```json
{
  "name": "roles_list",
  "arguments": {}
}
```

### `roles_create`

```json
{
  "name": "roles_create",
  "arguments": {
    "requestBody": {
      "name": "sales_rep",
      "title": "Sales Rep"
    }
  }
}
```

### `roles_update`

```json
{
  "name": "roles_update",
  "arguments": {
    "filterByTk": "reader",
    "requestBody": {
      "snippets": ["ui.logs", "ui.user"]
    }
  }
}
```

### `available_actions_list`

```json
{
  "name": "available_actions_list",
  "arguments": {}
}
```

### `data_sources_roles_get`

```json
{
  "name": "data_sources_roles_get",
  "arguments": {
    "dataSourceKey": "main",
    "filterByTk": "reader"
  }
}
```

### `data_sources_roles_update`

```json
{
  "name": "data_sources_roles_update",
  "arguments": {
    "dataSourceKey": "main",
    "filterByTk": "reader",
    "requestBody": {
      "strategy": {
        "actions": ["view"]
      }
    }
  }
}
```

### `roles_data_sources_collections_list`

Always include `filter.dataSourceKey`:

```json
{
  "name": "roles_data_sources_collections_list",
  "arguments": {
    "roleName": "reader",
    "filter": {
      "dataSourceKey": "main"
    },
    "paginate": false
  }
}
```

### `roles_data_source_resources_get`

Always include both `filter.dataSourceKey` and `filter.name`:

```json
{
  "name": "roles_data_source_resources_get",
  "arguments": {
    "roleName": "reader",
    "filter": {
      "dataSourceKey": "main",
      "name": "orders"
    },
    "appends": ["actions", "actions.scope"]
  }
}
```

Field policy reminder for full-field defaults:

- write using technical field names (`field.name`)
- include system fields returned by metadata (for example `sort`, `createdBy`, `createdById`, `updatedBy`, `updatedById`) unless user explicitly restricts them

## Troubleshooting Hints

1. `-32601 Method not found`: check whether you used `tools/call`.
2. `-32602 Invalid params`: verify `requestBody` nesting and required keys.
3. `403 No permissions`: current token/role lacks ACL management rights.
4. `404` on REST fallback endpoints: avoid path guesswork and use MCP tool contracts.
5. `500` with `Cannot destructure property 'dataSourceKey'` or `Cannot read properties of undefined (reading 'dataSourceKey')`:
   missing required `filter` keys on `roles_data_sources_collections_list` or `roles_data_source_resources_get`.
