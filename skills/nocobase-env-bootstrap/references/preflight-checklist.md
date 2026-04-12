# Preflight Checklist

## Purpose

Run this checklist before install, deploy, or upgrade. Block execution on `fail` items.
Preflight checks do not replace startup-complete MCP verification; use
`scripts/mcp-postcheck.ps1` or `scripts/mcp-postcheck.sh` after app startup when
`mcp_required=true`.
For install/deploy flows, MCP endpoint/auth blocking checks belong to the final
post-start MCP stage; preflight should primarily block on non-MCP critical items.

## Blocking Checks

1. Docker runtime availability (Docker path only)
- Verify `docker --version` works.
- Verify `docker info` is healthy.
- Verify `docker compose version` works.
- Fix link: <https://docs.docker.com/get-started/get-docker/>

2. Runtime toolchain availability (create-app and git paths)
- Verify `node -v` exists and is compatible (`>=20` recommended).
- Verify `yarn -v` exists (`1.22.x` recommended).
- Verify `git --version` exists for git path.
- Fix links:
  - <https://nodejs.org/en/download>
  - <https://classic.yarnpkg.com/lang/en/docs/install/>
  - <https://git-scm.com/install>

3. Port conflict
- Check whether target app port is already in use.
- Default is `13000`.
- If occupied, choose another port or stop the process using that port.

4. Path safety
- Ensure target path is writable.
- Avoid path containing spaces for CLI path compatibility.

5. Required env keys for startup and upgrade
- `APP_KEY` must be defined and random (at least 32 chars, no whitespace, not placeholder-like values such as `change-me`).
- `DB_DIALECT` must be available for runtime. For Docker templates, it can come from compose app environment; for non-Docker paths, set it in `.env`.
- Recommended minimum keys: `APP_KEY`, `APP_PORT`, `DB_DIALECT`.
- Reference: <https://docs.nocobase.com/cn/get-started/installation/env>

6. MCP endpoint activation (`mcp_required=true`)
- For install/deploy preflight, keep this check advisory and defer hard blocking to startup-complete `mcp-postcheck`.
- For `task=mcp-connect`, treat this check as immediate blocker.
- Verify MCP endpoint route exists (`/api/mcp` or `/api/__app/<app_name>/mcp`).
- If endpoint returns `404`, treat as blocker; run fixed sequence: `Use $nocobase-plugin-manage enable <activation_plugin_bundle> -> restart app -> rerun mcp-postcheck`.
- Activation bundle by `mcp_auth_mode`:
- `api-key` (default): `@nocobase/plugin-mcp-server @nocobase/plugin-api-keys`
- `oauth`: `@nocobase/plugin-mcp-server @nocobase/plugin-idp-oauth`
- `none`: `@nocobase/plugin-mcp-server`
- Plugin manager page is fallback only when runtime plugin-manage enable path is unavailable or failed.
- If endpoint returns `503` or other `5xx`, treat as blocker; restart app and retry after startup completes.

7. API key activation (`mcp_required=true` and `mcp_auth_mode=api-key`)
- Verify token env var exists (default `NOCOBASE_API_TOKEN`).
- Probe endpoint with bearer token.
- If token probe returns `401/403`, warn and continue to `mcp-postcheck` auto-refresh stage.
- Missing token and expired token are handled automatically in `mcp-postcheck` using CLI `generate-api-key`.
- Require user manual token step only when postcheck emits `action_required: provide_api_token`.

## Warning Checks

1. Network reachability
- Verify host can resolve and access docs/registry endpoints if in online mode.
- In restricted/offline mode, switch to offline package workflow.

2. Resource advisories
- Warn when host memory is low for container/runtime workload.
- Warn when free disk appears insufficient for images and dependencies.

3. Version drift
- Warn if using floating image tags in production-like environments.
- Warn if plugin versions are inconsistent with app version.

4. OAuth deferred verification (`mcp_required=true` and `mcp_auth_mode=oauth`)
- Warn that full OAuth verification is interactive and must be completed with client login command.

## Output Shape

Preflight output should always include:

- check id
- status (`fail`, `warn`, `pass`)
- message
- fix suggestion (if not pass)
- evidence (optional command output snippet)
- activation blocker hint when MCP/API key plugin activation is required

## Execution Rule

- If any non-MCP `fail` exists, stop and ask user to fix blockers first.
- For install/deploy/upgrade with `mcp_required=true` (default), run MCP as final post-start stage after app startup; do not treat deferred MCP checks as pre-start install blockers.
- For `task=mcp-connect`, if fails are only MCP activation/auth blockers, continue into MCP post-start state machine and auto-run fixed sequence first.
- Only when MCP gate emits `action_required: provide_api_token`, stop and require user to manually create/regenerate token and send it in chat (automatic path failed).
- If only `warn` exists, continue after showing warnings and confirmation.
