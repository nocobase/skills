# Preflight Checklist

## Purpose

Run this checklist before install, deploy, or upgrade. Block execution on `fail` items.

By default, preflight focuses on core environment readiness and does not require MCP checks.
MCP checks are executed only for explicit `task=mcp-connect`.

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

6. CLI bootstrap prerequisites
- Verify skill-local wrapper `./run-ctl.mjs` exists and `node` is available.
- Verify app env helper `./env-manage.mjs` exists and `node` is available.
- Wrapper will resolve global `nocobase-ctl`/`nbctl` first, then local `run.js` candidates.
- Verify token env exists or can be generated later for CLI env bootstrap (default `NOCOBASE_API_TOKEN`).
- For running targets (deploy/upgrade/diagnose), verify CLI dependency plugins:
- `@nocobase/plugin-api-doc` (`swagger:get` source for `env update`)
- `@nocobase/plugin-api-keys` (token generation/refresh path)
- If dependency plugins are missing, apply activation sequence:
- `Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc @nocobase/plugin-api-keys -> restart app -> rerun cli-postcheck`

## MCP Blocking Checks (explicit `task=mcp-connect` only)

1. MCP endpoint activation
- Verify endpoint route exists (`/api/mcp` or `/api/__app/<app_name>/mcp`).
- If endpoint returns `404`, run fixed activation sequence:
- `Use $nocobase-plugin-manage enable <activation_plugin_bundle> -> restart app -> rerun mcp-postcheck`

2. API key activation (API-key mode)
- Verify token env var exists (default `NOCOBASE_API_TOKEN`).
- Probe endpoint with bearer token.
- For `401/403`, use `mcp-postcheck` auto-refresh path first.

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

4. OAuth deferred verification (`task=mcp-connect` and `mcp_auth_mode=oauth`)
- Warn that full OAuth verification is interactive and must be completed with client login command.

## Output Shape

Preflight output should always include:

- check id
- status (`fail`, `warn`, `pass`)
- message
- fix suggestion (if not pass)
- evidence (optional command output snippet)

## Execution Rule

- If any non-MCP `fail` exists, stop and ask user to fix blockers first.
- For install/deploy/upgrade, preflight does not block on MCP readiness.
- For install/deploy/upgrade, plugin activation checks may be deferred until app startup, but CLI final stage must enforce the dependency bundle before `env update`.
- For explicit `task=mcp-connect`, enforce MCP blockers and activation guidance.
- If only `warn` exists, continue after showing warnings and confirmation.
