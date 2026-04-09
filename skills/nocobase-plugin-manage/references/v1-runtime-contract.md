# V1 Runtime Contract

## Table of Contents

1. [Purpose](#purpose)
2. [Source Evidence](#source-evidence)
3. [Runtime Endpoint Map](#runtime-endpoint-map)
4. [Local CLI Map](#local-cli-map)
5. [Local Docker CLI Map](#local-docker-cli-map)
6. [Invocation Patterns](#invocation-patterns)
7. [Target Auto-Resolution](#target-auto-resolution)
8. [Verification Rules](#verification-rules)
9. [Failure Handling](#failure-handling)

## Purpose

Define the V1 operation contract used by `nocobase-plugin-manage` without changing NocoBase source code.

## Source Evidence

- CLI mutation commands are registered in `packages/core/server/src/commands/pm.ts`:
- `pm add`
- `pm enable`
- `pm disable`
- Resource actions are exposed in `packages/core/server/src/plugin-manager/options/resource.ts`:
- `pm:add`
- `pm:enable`
- `pm:disable`
- `pm:list`
- `pm:get`
- `pm:listEnabled`
- `pm:listEnabledV2`
- Plugin inventory is runtime-backed in `packages/presets/nocobase/src/server/index.ts`:
- `getAllPlugins()`
- `getPluginInfo()`
- plugin state fields `enabled` and `installed` come from `applicationPlugins` repository.

## Runtime Endpoint Map

Use NocoBase action routing style with `/api/` prefix.

| Action | Typical Route | Notes |
|---|---|---|
| list all plugin info | `/api/pm:list` | returns plugin catalog with status fields |
| get one plugin | `/api/pm:get?filterByTk=<plugin>` | use plugin alias or package name |
| list enabled (client lane) | `/api/pm:listEnabled` | includes plugin URL for client lane |
| list enabled (client-v2 lane) | `/api/pm:listEnabledV2` | filters by `client-v2.js` entry |
| add plugin (remote) | `/api/pm:add` | async trigger to `runAsCLI(['pm','add',...])` |
| enable plugin (remote) | `/api/pm:enable?filterByTk=<plugin>` | async trigger to `runAsCLI(['pm','enable',...])` |
| disable plugin (remote) | `/api/pm:disable?filterByTk=<plugin>` | async trigger to `runAsCLI(['pm','disable',...])` |

Notes:

- Route transport is environment-dependent; use app API client when available.
- If plain HTTP is used, include authentication expected by target deployment.

## Local CLI Map

| Action | Command |
|---|---|
| add plugin | `yarn nocobase pm add <plugin> [--registry=<url>] [--version=<v>] [--auth-token=<token>]` |
| enable plugin | `yarn nocobase pm enable <plugin>` |
| disable plugin | `yarn nocobase pm disable <plugin>` |

Run commands in local app directory (`target.app_path`).

## Local Docker CLI Map

Default compose service is `app` unless explicitly overridden.

| Action | Command |
|---|---|
| add plugin | `docker compose exec -T <service> yarn nocobase pm add <plugin> [--registry=<url>] [--version=<v>] [--auth-token=<token>]` |
| enable plugin | `docker compose exec -T <service> yarn nocobase pm enable <plugin>` |
| disable plugin | `docker compose exec -T <service> yarn nocobase pm disable <plugin>` |

Run commands in local app directory (`target.app_path`) where compose files are present.

## Invocation Patterns

### Local inspect/install/enable/disable

```json
{
  "action": "disable",
  "target": {
    "mode": "local",
    "app_path": "E:/apps/my-nocobase",
    "base_url": "http://127.0.0.1:13000",
    "compose_service": "app"
  },
  "execution_backend": "auto",
  "plugins": ["@nocobase/plugin-example"],
  "execution_mode": "safe"
}
```

### Remote inspect/install/enable/disable

```json
{
  "action": "install",
  "target": {
    "mode": "remote",
    "base_url": "https://demo.example.com"
  },
  "execution_backend": "auto",
  "auth": {
    "token_env": "NOCOBASE_TOKEN_DEMO"
  },
  "plugins": ["@nocobase/plugin-example"],
  "options": {
    "registry": "https://registry.npmjs.org",
    "version": "latest",
    "auth_token_env": null
  },
  "execution_mode": "safe"
}
```

### Compact invocation (recommended for other skills)

```text
Use $nocobase-plugin-manage inspect
Use $nocobase-plugin-manage enable @nocobase/plugin-mcp-server
Use $nocobase-plugin-manage disable file-manager
```

The compact style is normalized to the structured payload internally.

## Target Auto-Resolution

When `target.mode` is omitted or set to `auto`, resolve channel with this priority:

1. explicit `target.base_url` -> `remote`
2. explicit `target.app_path` -> `local`
3. workspace looks like a NocoBase app -> `local`
4. `NOCOBASE_BASE_URL` or `APP_BASE_URL` env exists -> `remote`
5. fallback -> `local` using current working directory

If both local and remote appear valid and confidence is low, ask one disambiguation question before mutation.

When channel resolves to `local`, resolve execution backend with this priority:

1. explicit `execution_backend` (if not `auto`)
2. local Docker backend (`docker_cli`) when compose environment is available and service exists (default `app`)
3. local host backend (`host_cli`) when `yarn nocobase` is available
4. fallback to `remote_api` when base URL and auth prerequisites are satisfied
5. if none are available, stop and return rich fallback hints

## Verification Rules

- Always capture pre-state in `safe` mode.
- For `install`, treat success as plugin becoming discoverable in `pm:list` or `pm:get`.
- For `enable`, treat success as `enabled=true` in `pm:get`.
- For `disable`, treat success as `enabled=false` in `pm:get`.
- Poll interval: 2 seconds.
- Default timeout: 90 seconds.
- If timeout occurs, return `pending_verification` with last known state.
- Commands in output must reflect actual backend (`docker compose ...` or `yarn ...` or API routes).

## Failure Handling

- Missing auth token for remote writes: block and return missing env var name.
- 401/403 from remote API: treat as authentication/authorization issue; refresh login or API key token before retry.
- Plugin not found during disable: stop and return explicit not-found state.
- API unavailable in safe mode: stop mutation; ask for reachable `base_url` or explicit switch to `fast` mode.
- Async mutation uncertainty: never mark success without readback confirmation.
- Backend unavailable (`docker_cli`, `host_cli`, and `remote_api` all unavailable): return `verification=failed` and rich fallback hints:
- `Plugin manager URL`: `<base_url>/admin/settings/plugin-manager`
- `API keys URL`: `<base_url>/admin/settings/api-keys`
- when `base_url` is unknown, use default `http://127.0.0.1:13000`
- `Manual activation`: enable target plugin in plugin manager UI, restart app, rerun inspect/postcheck
- `MCP special case`: enable `@nocobase/plugin-mcp-server`, restart app, rerun MCP postcheck
