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

## Troubleshooting Hints

1. `-32601 Method not found`: check whether you used `tools/call`.
2. `-32602 Invalid params`: verify `requestBody` nesting and required keys.
3. `403 No permissions`: current token/role lacks ACL management rights.
4. `404` on REST fallback endpoints: avoid path guesswork and use MCP tool contracts.
