# MCP Troubleshooting

Use this guide when MCP calls fail during install/deploy bootstrap or early tool usage.

## Fast Triage Path

1. Verify endpoint route (`/api/mcp` or `/api/__app/<app_name>/mcp`).
2. Run `initialize`.
3. Run `tools/list`.
4. Run one `tools/call` read-only probe.
5. Only then run mutation tools.

## Error Map

| Signal | Likely Cause | Fix |
|---|---|---|
| HTTP 404 on `/api/mcp` | MCP plugin route inactive | Run `Use $nocobase-plugin-manage enable <activation_plugin_bundle> -> restart app -> rerun postcheck` |
| HTTP 503 | app still reloading | restart app, wait startup complete, rerun postcheck |
| HTTP 401/403 | token missing/invalid or auth plugin not ready | ensure activation bundle includes API Keys plugin; auto-refresh token via CLI `generate-api-key`; manual token fallback only if auto-refresh fails |
| JSON-RPC `-32601 Method not found` | wrong method pattern (for example raw `resource_update`) | call tools via `method: "tools/call"` with `params.name` and `params.arguments` |
| `Client must accept both application/json and text/event-stream` | missing/incorrect `Accept` header | set `Accept: application/json, text/event-stream` |
| tools/list returns but tool call fails with invalid params | wrong argument shape | inspect runtime schema from `tools/list`, then fix nested `requestBody` and required keys |

## Known Misuse Patterns

1. Calling business operation as raw method:
- incorrect: `method: "resource_update"`
- correct: `method: "tools/call"` + `params.name: "<tool_name>"`

2. Skipping initialize:
- some clients may appear to work without explicit initialize, but stable flow should keep initialize as first request.

3. Assuming all listed tool aliases are interchangeable:
- prefer concrete tool names observed in runtime, such as `data_sources_roles_update`.

## Evidence to Capture in Reports

1. endpoint URL and auth mode
2. initialize request + status
3. tools/list request + sampled tool names
4. first failing tools/call payload
5. full error message and error code

Capturing this evidence shortens diagnosis loop significantly.
