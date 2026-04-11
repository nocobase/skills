# MCP Runbook

## Goal

Bootstrap and verify NocoBase MCP connectivity so downstream development workflows can use MCP reliably.

## Contents

1. Prerequisites
2. Endpoint Selection
3. RPC Contract
4. Initialize and Session Strategy
5. Activation Gate
6. Post-Start Gate Command
7. API Key Path
8. OAuth Path
9. Package Scope Control
10. Client Templates and Fixed Scripts
11. Verification Checklist
12. Failure Handling
13. Reference Files

## Prerequisites

1. NocoBase app is running and reachable.
2. Endpoint path is confirmed:
- Main app: `/api/mcp`
- Non-main app: `/api/__app/<app_name>/mcp`
3. Client transport uses streamable HTTP.

## RPC Contract

1. Use JSON-RPC over streamable HTTP.
2. Tool execution must use method `tools/call`.
3. Request headers must include:
- `Content-Type: application/json`
- `Accept: application/json, text/event-stream`
4. Do not execute business operations as raw methods such as `resource_update`.

Canonical tool call shape:

```json
{
  "jsonrpc": "2.0",
  "id": 10,
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

## Initialize and Session Strategy

1. Use stable sequence: `initialize -> tools/list -> tools/call`.
2. If initialize returns `Mcp-Session-Id` response header, pass it in later requests.
3. If no session header is returned, continue without session id.
4. Treat JSON-RPC `error` as blocking failure before mutation work.

## Endpoint Selection

1. Main app endpoint:

```text
http(s)://<host>:<port>/api/mcp
```

2. Non-main app endpoint:

```text
http(s)://<host>:<port>/api/__app/<app_name>/mcp
```

3. If custom reverse proxy path is used, validate final routed URL with a probe before client config.

## Activation Gate

Treat plugin activation as a hard gate.

Admin URL templates (replace `<base_url>` with actual app base URL):

- Plugin manager: `<base_url>/admin/settings/plugin-manager`
- API keys page: `<base_url>/admin/settings/api-keys`

1. MCP plugin-bundle activation gate:
- If endpoint probe returns `404`, treat as MCP route unavailable.
- Build auth-mode bundle first:
- `api-key` (default): `@nocobase/plugin-mcp-server @nocobase/plugin-api-keys`
- `oauth`: `@nocobase/plugin-mcp-server @nocobase/plugin-idp-oauth`
- `none`: `@nocobase/plugin-mcp-server`
- MUST use `nocobase-plugin-manage` primary path with compact invocation:
- `Use $nocobase-plugin-manage enable <activation_plugin_bundle>`
- Runtime implementation maps to plugin-manager action `pm:enable`.
- Do not bypass `nocobase-plugin-manage` with ad-hoc container shell plugin commands.
- `nocobase-plugin-manage` may auto-select docker CLI internally for local Docker apps.
- Fixed execution sequence:
- 1) run `Use $nocobase-plugin-manage enable <activation_plugin_bundle>`
- 2) restart app immediately
- 3) rerun postcheck
- If plugin-manage returns backend unavailable/unreachable, output rich fallback hints directly:
- plugin manager URL
- API keys URL
- manual activation + restart + rerun postcheck steps
- Only if runtime action path is unavailable, fallback to manual activation in NocoBase admin.
- User steps:
- Open plugin manager URL.
- Enable all plugins in auth-mode bundle.
- Wait for refresh/restart.
- If endpoint still returns `404` or `503`, restart app, wait for startup complete, then retry probe.

2. API key token gate (API key mode only):
- If API token is missing or probe returns `401/403`, stop workflow.
- `@nocobase/plugin-api-keys` should already be included in activation bundle for `api-key` mode.
- Ask user to create/recreate API token and retry.
- Do not attempt automatic API key creation or token retrieval via CLI/API/DB/UI automation.
- User steps:
- Open API keys page URL.
- Add an API key with required role permissions.
- Copy token and export to env var (default `NOCOBASE_API_TOKEN`).

3. Do not continue downstream MCP-dependent development when any activation blocker exists.

## Post-Start Gate Command

Run MCP postcheck after app startup and before client `mcp add`.

1. Windows:

```powershell
powershell -File scripts/mcp-postcheck.ps1 -Port 13000 -McpAuthMode api-key -McpTokenEnv NOCOBASE_API_TOKEN
```

2. Linux/macOS:

```bash
MCP_AUTH_MODE=api-key MCP_TOKEN_ENV=NOCOBASE_API_TOKEN bash scripts/mcp-postcheck.sh 13000
```

3. Gate interpretation:
- If output contains `action_required: activate_plugin`, run fixed sequence `Use $nocobase-plugin-manage enable <activation_plugin_bundle> -> restart_app -> rerun_postcheck` first.
- Do not run alternative diagnostics before the fixed sequence above is completed.
- If output contains `action_required: restart_app`, restart app and rerun postcheck.
- Do not request token/manual API-key step while endpoint blocker (`activate_plugin` or `restart_app`) is unresolved.
- If output contains `action_required: provide_api_token`, stop automation and ask user to create/regenerate API key manually and send token value.
- If output contains protocol failure (`MCP-PROTO-*`), fix request shape/headers first.
- After user confirms activation or provides token, rerun postcheck until pass.

## API Key Path

1. Export API token env var (default: `NOCOBASE_API_TOKEN`).
2. Add MCP server in client with bearer token env var.
3. Probe MCP endpoint with token and confirm it no longer fails for auth reasons.

Codex command pattern:

```bash
export NOCOBASE_API_TOKEN=<your_api_key>
codex mcp add nocobase --url http://<host>:<port>/api/mcp --bearer-token-env-var NOCOBASE_API_TOKEN
```

PowerShell variant:

```powershell
$env:NOCOBASE_API_TOKEN="<your_api_key>"
codex mcp add nocobase --url http://<host>:<port>/api/mcp --bearer-token-env-var NOCOBASE_API_TOKEN
```

For non-codex clients, generate fixed templates from the helper script in this skill:

```powershell
powershell -File scripts/render-mcp-client-template.ps1 -Client opencode -BaseUrl http://127.0.0.1:13000 -McpAuthMode api-key -TokenEnv NOCOBASE_API_TOKEN
```

## OAuth Path

1. Add MCP server in client.
2. Run interactive login and request `mcp,offline_access` scopes.
3. Verify token is cached and endpoint is callable.

Codex command pattern:

```bash
codex mcp add nocobase --url http://<host>:<port>/api/mcp
codex mcp login nocobase --scopes mcp,offline_access
```

## Package Scope Control

Use `x-mcp-packages` to limit exposed package capabilities.

1. Default: empty (server default exposure).
2. Restricted mode: provide comma-separated package list.
3. Always echo effective package scope in final output evidence.

## Client Templates and Fixed Scripts

Use these scripts to avoid client-specific config mistakes.

1. Windows template generator:

```powershell
powershell -File scripts/render-mcp-client-template.ps1 -Client <codex|claude|opencode|vscode|windsurf|cline> -BaseUrl <app_base_url> -McpAuthMode <api-key|oauth|none> -McpScope <main|non-main> -McpAppName <app_name_if_non_main> -TokenEnv NOCOBASE_API_TOKEN -McpPackages "<pkg1,pkg2>"
```

2. Linux/macOS template generator:

```bash
bash scripts/render-mcp-client-template.sh <codex|claude|opencode|vscode|windsurf|cline> <app_base_url> <api-key|oauth|none> <main|non-main> <app_name_if_non_main> NOCOBASE_API_TOKEN "<pkg1,pkg2>"
```

3. Template reference:
- [MCP Client Templates](mcp-client-templates.md)

4. `opencode` note:
- Use remote MCP config with explicit `Accept: application/json, text/event-stream`.
- API token placeholder format is `{env:NOCOBASE_API_TOKEN}` (different from `${NOCOBASE_API_TOKEN}` used by some other clients).

## Verification Checklist

1. Endpoint returns non-404 status.
2. Auth mode probe passes or has explicit follow-up action.
3. Activation blockers are resolved:
- `MCP Server` plugin activated.
- `API Keys` plugin activated for API key mode.
4. Post-start gate command is executed and passes.
5. Protocol chain probe passes (`initialize`, `tools/list`, and at least one `tools/call` probe when available).
6. Client command and endpoint values are recorded.
7. Final output contains endpoint, auth mode, package scope, and next action.

## Failure Handling

1. `404` on endpoint:
- Root-cause hypothesis: MCP route not active.
- Action: run fixed sequence `Use $nocobase-plugin-manage enable <activation_plugin_bundle> -> restart app -> rerun postcheck`.

2. `401/403` in API key mode:
- Root-cause hypothesis: activation bundle incomplete or token invalid.
- Action: ensure activation bundle includes `@nocobase/plugin-api-keys` (plugin-manage first, manual fallback only if backend unavailable), regenerate token manually, retry.

3. `503` on endpoint:
- Root-cause hypothesis: app is still preparing or reload not completed.
- Action: restart app and wait for startup completion, then rerun postcheck.

4. Network timeout:
- Root-cause hypothesis: service not reachable or proxy/firewall issue.
- Action: verify host/port routing, service health, and network policy.

5. JSON-RPC `-32601 Method not found`:
- Root-cause hypothesis: wrong method pattern.
- Action: use `tools/call` wrapper and runtime tool names from `tools/list`.

6. `Client must accept both application/json and text/event-stream`:
- Root-cause hypothesis: incorrect `Accept` header.
- Action: send `Accept: application/json, text/event-stream`.

## Reference Files

- [MCP Call Examples](mcp-call-examples.md)
- [MCP Tool Shapes](mcp-tool-shapes.md)
- [MCP Client Templates](mcp-client-templates.md)
- [MCP Troubleshooting](mcp-troubleshooting.md)
- [MCP PowerShell Helpers](mcp-powershell-helpers.md)
