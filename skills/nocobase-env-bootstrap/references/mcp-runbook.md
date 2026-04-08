# MCP Runbook

## Goal

Bootstrap and verify NocoBase MCP connectivity so downstream development workflows can use MCP reliably.

## Contents

1. Prerequisites
2. Endpoint Selection
3. Activation Gate
4. API Key Path
5. OAuth Path
6. Package Scope Control
7. Verification Checklist
8. Failure Handling

## Prerequisites

1. NocoBase app is running and reachable.
2. Endpoint path is confirmed:
- Main app: `/api/mcp`
- Non-main app: `/api/__app/<app_name>/mcp`
3. Client transport uses streamable HTTP.

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

1. MCP Server activation gate:
- If endpoint probe returns `404`, treat as MCP server route unavailable.
- Stop workflow and instruct user to activate `MCP Server` plugin manually in NocoBase admin, then retry probe.

2. API Keys activation gate (API key mode only):
- If API token is missing or probe returns `401/403`, stop workflow.
- Instruct user to activate `API Keys` plugin manually, create/recreate API token, and retry.

3. Do not continue downstream MCP-dependent development when any activation blocker exists.

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

## Verification Checklist

1. Endpoint returns non-404 status.
2. Auth mode probe passes or has explicit follow-up action.
3. Activation blockers are resolved:
- `MCP Server` plugin activated.
- `API Keys` plugin activated for API key mode.
4. Client command and endpoint values are recorded.
5. Final output contains endpoint, auth mode, package scope, and next action.

## Failure Handling

1. `404` on endpoint:
- Root-cause hypothesis: MCP route not active.
- Action: activate `MCP Server` plugin manually and retry probe.

2. `401/403` in API key mode:
- Root-cause hypothesis: `API Keys` plugin inactive or token invalid.
- Action: activate `API Keys` plugin manually, regenerate token, retry.

3. Network timeout:
- Root-cause hypothesis: service not reachable or proxy/firewall issue.
- Action: verify host/port routing, service health, and network policy.
