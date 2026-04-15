# MCP Tool Shapes

Use runtime `tools/list` as the final source of truth. This file provides common examples verified in local testing on 2026-04-10.

## Core Shape

All tool calls use:

```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "tools/call",
  "params": {
    "name": "<tool_name>",
    "arguments": {}
  }
}
```

## Common Tools

### `data_sources_roles_get`

Purpose: read role table strategy under a specific data source.

Arguments:

```json
{
  "dataSourceKey": "main",
  "filterByTk": "member"
}
```

### `data_sources_roles_update`

Purpose: update role strategy under a specific data source.

Arguments:

```json
{
  "dataSourceKey": "main",
  "filterByTk": "member",
  "requestBody": {
    "strategy": {
      "actions": ["view"]
    }
  }
}
```

### `roles_list`

Purpose: list available roles.

Arguments:

```json
{}
```

### `roles_update`

Purpose: update role-level metadata or snippets.

Arguments (example):

```json
{
  "filterByTk": "reader",
  "requestBody": {
    "snippets": ["ui.logs", "ui.user"]
  }
}
```

### `available_actions_list`

Purpose: list ACL action names before configuring permissions.

Arguments:

```json
{}
```

## Notes

1. Some tools require nested `requestBody`.
2. Action strategy payloads are usually under `requestBody.strategy`.
3. Do not infer argument names from REST paths directly; confirm with `tools/list` schema.
4. If a tool is absent from runtime `tools/list`, treat it as unavailable for current app/plugin state.
