# Preflight Checklist

## Purpose

Run this checklist before install, deploy, or upgrade. Block execution on `fail` items.

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
- `DB_DIALECT` must be defined for app runtime.
- Recommended minimum keys: `APP_ENV`, `APP_PORT`, `DB_DIALECT`.
- Reference: <https://docs.nocobase.com/cn/get-started/installation/env>

6. MCP endpoint activation (`mcp_required=true`)
- Verify MCP endpoint route exists (`/api/mcp` or `/api/__app/<app_name>/mcp`).
- If endpoint returns `404`, treat as blocker and require user to activate `MCP Server` plugin manually.

7. API key activation (`mcp_required=true` and `mcp_auth_mode=api-key`)
- Verify token env var exists (default `NOCOBASE_API_TOKEN`).
- Probe endpoint with bearer token.
- If token probe returns `401/403`, treat as blocker and require user to activate `API Keys` plugin manually and refresh token.

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

- If any `fail` exists, stop and ask user to fix blockers first.
- If only `warn` exists, continue after showing warnings and confirmation.
