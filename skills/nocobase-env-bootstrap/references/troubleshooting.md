# Troubleshooting KB

## Usage

Find the first matching symptom and apply the listed checks in order. Stop after first confirmed root cause.

## Contents

1. NB-ENV-001: Environment mismatch (License)
2. NB-ENV-002: Startup failure (App not starting)
3. NB-ENV-003: Plugin install or download issues
4. NB-ENV-004: Upgrade regression after version change
5. NB-ENV-005: Docker state mismatch after restart
6. NB-ENV-006: Database dialect/connection setup failure
7. NB-ENV-007: MCP endpoint not found (`404`)
8. NB-ENV-008: MCP API key auth failure (`401/403`)
9. NB-ENV-009: MCP package scope missing tools
10. NB-ENV-010: MCP OAuth scope or login flow issue

---

## NB-ENV-001: Environment mismatch (License)

Symptoms:

- License page shows `Environment mismatch`.
- App worked before but shows abnormal license status after infra or DB change.

Checks:

1. Confirm whether server identity, storage, or database changed recently.
2. Generate/verify instance id.
3. Verify current license key matches current instance identity.

Actions:

1. Regenerate and apply a valid key for current instance.
2. Keep instance identity and storage path stable where possible.
3. Re-check license status after restart.

Evidence examples:

- Ticket patterns with recurring "Environment mismatch" reports.

---

## NB-ENV-002: Startup failure (App not starting)

Symptoms:

- App cannot start.
- Service worked before and then stopped unexpectedly.

Checks:

1. Check runtime logs first.
2. Check port conflict (default 13000).
3. Check required env keys such as `DB_DIALECT`.
4. Check runtime artifact/build state on non-Docker paths.

Actions:

1. Free conflicting port or switch port.
2. Fix missing/invalid env values.
3. Rebuild/restart based on selected runtime path.

---

## NB-ENV-003: Plugin install or download issues

Symptoms:

- Cannot download purchased plugin package.
- Installed plugin not available or cannot be configured.

Checks:

1. Confirm network profile (online/restricted/offline).
2. Confirm plugin package source and version compatibility.
3. Confirm plugin dependency checks in app UI/log.

Actions:

1. For restricted/offline network, use approved offline package workflow.
2. Align plugin versions with app version.
3. Reinstall plugin and validate dependency state.

---

## NB-ENV-004: Upgrade regression after version change

Symptoms:

- App errors immediately after upgrade.
- Plugin dependency check failures after image/version update.

Checks:

1. Confirm exact source and target versions.
2. Inspect startup logs and plugin dependency checks.
3. Verify key modules and login flow after restart.

Actions:

1. Fix version mismatch and dependency incompatibility.
2. Re-run upgrade sequence cleanly.
3. If still failing, restore from backup and plan a staged retry.

---

## NB-ENV-005: Docker state mismatch after restart

Symptoms:

- Expected plugin/config/runtime state disappears after restart.

Checks:

1. Verify compose volume mappings.
2. Verify persistent storage paths.
3. Verify startup scripts are not removing runtime plugin state unexpectedly.

Actions:

1. Correct volume mounts and persistence settings.
2. Restart services and confirm state persistence.
3. Capture logs for unexpected cleanup behavior.

---

## NB-ENV-006: Database dialect/connection setup failure

Symptoms:

- Unsupported dialect errors.
- Cannot connect to MariaDB/MSSQL/PostgreSQL from app.

Checks:

1. Verify `DB_DIALECT` matches actual database engine.
2. Verify host, port, database, username, password.
3. Verify network reachability between app and database.

Actions:

1. Correct dialect and credentials.
2. Confirm DB server allows incoming connections.
3. Restart app and validate connection health.

---

## NB-ENV-007: MCP endpoint not found (`404`)

Symptoms:

- MCP client cannot connect and route returns `404`.
- Base app is reachable, but MCP endpoint path fails.

Checks:

1. Confirm endpoint path (`/api/mcp` for main app, `/api/__app/<app_name>/mcp` for non-main app).
2. Confirm app name segment is correct for non-main app.
3. Confirm `MCP Server` plugin activation state in NocoBase admin.
4. Confirm auth companion plugin state:
- `api-key` mode: `API Keys`
- `oauth` mode: `IdP: OAuth`

Actions:

1. Run fixed sequence only: `Use $nocobase-plugin-manage enable <activation_plugin_bundle> -> restart app -> rerun postcheck`.
2. Activation bundle by auth mode:
- `api-key` (default): `@nocobase/plugin-mcp-server @nocobase/plugin-api-keys`
- `oauth`: `@nocobase/plugin-mcp-server @nocobase/plugin-idp-oauth`
- `none`: `@nocobase/plugin-mcp-server`
3. Do not run alternative diagnostics before the fixed sequence is completed.
4. If endpoint remains `404` or becomes `503`, repeat restart + postcheck loop.
5. Re-check endpoint and rerun client MCP add/connect command.

---

## NB-ENV-008: MCP API key auth failure (`401/403`)

Symptoms:

- Endpoint route exists, but API key request gets `401` or `403`.

Checks:

1. Confirm bearer token env var is set and not empty.
2. Confirm token is valid and belongs to expected workspace/user context.
3. Confirm `API Keys` plugin activation state in NocoBase admin.

Actions:

1. Ensure activation bundle includes `@nocobase/plugin-api-keys` (run plugin-manage bundle first; use manual plugin page only when backend unavailable).
2. Regenerate API key and update env var.
3. Retry MCP probe and client connect command.

---

## NB-ENV-009: MCP package scope missing tools

Symptoms:

- MCP server connects, but expected tools are unavailable.
- Tool list looks too small after package filtering.

Checks:

1. Inspect `x-mcp-packages` value used by client.
2. Confirm required package names are included.
3. Confirm package/plugin compatibility with current NocoBase version.

Actions:

1. Expand or clear `x-mcp-packages` restriction.
2. Reconnect MCP server and re-check tool list.
3. Keep a minimal but sufficient package allowlist.

---

## NB-ENV-010: MCP OAuth scope or login flow issue

Symptoms:

- OAuth login flow fails or MCP requests fail after login.
- Client reports missing permissions for MCP actions.

Checks:

1. Confirm login requested scopes include `mcp,offline_access`.
2. Confirm OAuth/IdP configuration is complete for current client.
3. Confirm callback or device flow is not blocked by network policy.

Actions:

1. Re-run OAuth login with required scopes.
2. Fix OAuth provider/config and retry login.
3. Validate endpoint access after fresh token acquisition.

---

## NB-ENV-011: MCP `406 Not Acceptable` after token is provided

Symptoms:

- API token is already configured, but MCP connection still fails.
- Server log contains: `Client must accept both application/json and text/event-stream`.
- Request log may show mixed `401` and `406` during repeated retries.

Checks:

1. Confirm MCP client sends `Accept: application/json, text/event-stream`.
2. Confirm MCP client sends `Content-Type: application/json` for JSON-RPC POST.
3. Confirm token placeholder syntax matches client type:
- `opencode`: `{env:NOCOBASE_API_TOKEN}`
- `claude`/`cline`: `${NOCOBASE_API_TOKEN}`
- `windsurf`: `{{NOCOBASE_API_TOKEN}}`
4. Confirm endpoint path is correct for app scope (`/api/mcp` vs `/api/__app/<app_name>/mcp`).

Actions:

1. Generate fresh client template via fixed script:
- Windows: `powershell -File scripts/render-mcp-client-template.ps1 -Client <client> ...`
- Linux/macOS: `bash scripts/render-mcp-client-template.sh <client> ...`
2. Reapply template without manual edits first.
3. Rerun `mcp-postcheck` and then client connect.
4. If still failing, capture one full initialize request/response pair including request headers.
