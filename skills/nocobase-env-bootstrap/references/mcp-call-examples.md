# MCP Call Examples

Use this file when MCP requests fail because of incorrect JSON-RPC shape, missing headers, or transport assumptions.

## Transport Rules

1. Endpoint is streamable HTTP (`/api/mcp` or `/api/__app/<app_name>/mcp`).
2. Always send:
- `Content-Type: application/json`
- `Accept: application/json, text/event-stream`
3. Use JSON-RPC method `tools/call` for tool execution.
4. Do not call business operations as raw JSON-RPC methods such as `resource_update`.

## Initialize

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "nocobase-env-bootstrap",
      "version": "1.2.0"
    }
  }
}
```

If response headers contain `Mcp-Session-Id`, send that value in later requests:

```text
Mcp-Session-Id: <session-id>
```

## Tools List

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

Use this response as the source of truth for tool names and input shapes.

## Tools Call (Correct)

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "data_sources_roles_update",
    "arguments": {
      "dataSourceKey": "main",
      "filterByTk": "member",
      "requestBody": {
        "strategy": {
          "actions": ["view"]
        }
      }
    }
  }
}
```

## Incorrect Pattern (Do Not Use)

```json
{
  "jsonrpc": "2.0",
  "id": 20,
  "method": "resource_update",
  "params": {
    "resource": "dataSources.roles",
    "filterByTk": "member",
    "dataSource": "main"
  }
}
```

Why incorrect:

- NocoBase MCP tool execution contract is `tools/call`.
- Raw method names like `resource_update` are not reliable tool endpoints in this workflow.

## Minimal Probe Sequence

1. `initialize`
2. `tools/list`
3. `tools/call` with a known read-only tool from `tools/list`

Stop and troubleshoot if any step returns JSON-RPC `error` or non-2xx HTTP status.
