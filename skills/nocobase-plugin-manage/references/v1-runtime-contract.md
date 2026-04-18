# V1 Runtime Contract

## Table of Contents

1. [Purpose](#purpose)
2. [Source Evidence](#source-evidence)
3. [Runtime Endpoint Map](#runtime-endpoint-map)
4. [Local CLI Map](#local-cli-map)
5. [Local Docker CLI Map](#local-docker-cli-map)
6. [Local CLI Output Framing](#local-cli-output-framing)
7. [Invocation Patterns](#invocation-patterns)
8. [Target Auto-Resolution](#target-auto-resolution)
9. [Verification Rules](#verification-rules)
10. [Failure Handling](#failure-handling)

## Purpose

Define the V1 operation contract used by `nocobase-plugin-manage` without changing NocoBase source code.

## Source Evidence

- CLI inspect/mutation commands are registered in `packages/core/server/src/commands/pm.ts`:
- `pm list`
- `pm enable`
- `pm disable`
- Resource actions are exposed in `packages/core/server/src/plugin-manager/options/resource.ts`:
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
| enable plugin (remote) | `/api/pm:enable?filterByTk=<plugin>` | async trigger to `runAsCLI(['pm','enable',...])` |
| disable plugin (remote) | `/api/pm:disable?filterByTk=<plugin>` | async trigger to `runAsCLI(['pm','disable',...])` |

Notes:

- Route transport is environment-dependent; use app API client when available.
- If plain HTTP is used, include authentication expected by target deployment.

## Local CLI Map

| Action | Command |
|---|---|
| list all plugin info | `yarn nocobase pm list` |
| enable plugin | `yarn nocobase pm enable <plugin>` |
| disable plugin | `yarn nocobase pm disable <plugin>` |

Run commands in local app directory (`target.app_path`).

## Local Docker CLI Map

Default compose service is `app` unless explicitly overridden.

| Action | Command |
|---|---|
| list all plugin info | `docker compose exec -T <service> yarn nocobase pm list` |
| enable plugin | `docker compose exec -T <service> yarn nocobase pm enable <plugin>` |
| disable plugin | `docker compose exec -T <service> yarn nocobase pm disable <plugin>` |

Run commands in local app directory (`target.app_path`) where compose files are present.

## Local CLI Output Framing

For local inspect/readback using `pm list`, parse plugin payload strictly from the marker block:

- begin marker: `--- BEGIN_PLUGIN_LIST_JSON ---`
- end marker: `--- END_PLUGIN_LIST_JSON ---`
- canonical payload: JSON text between the two markers

Ignore surrounding build/status lines such as TypeScript compiling logs and elapsed time.
If marker block is missing or JSON parse fails, fallback to API inspect (`pm:list`/`pm:get`) and record fallback reason.

## Invocation Patterns

### Local inspect/enable/disable

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

### Remote inspect/enable/disable

```json
{
  "action": "enable",
  "target": {
    "mode": "remote",
    "base_url": "https://demo.example.com"
  },
  "execution_backend": "auto",
  "auth": {
    "token_env": "NOCOBASE_TOKEN_DEMO"
  },
  "plugins": ["@nocobase/plugin-example"],
  "execution_mode": "safe"
}
```

### Compact invocation (recommended for other skills)

```text
Use $nocobase-plugin-manage inspect
Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc
Use $nocobase-plugin-manage disable file-manager
```

The compact style is normalized to the structured payload internally.

## Target Auto-Resolution

When `target.mode` is omitted or set to `auto`, resolve channel with this priority:

1. explicit `target.app_path` -> `local` (this remains true even if `target.base_url` is also provided)
2. explicit `target.base_url` with no `target.app_path` -> `remote`
3. workspace looks like a NocoBase app -> `local`
4. `NOCOBASE_BASE_URL` or `APP_BASE_URL` env exists -> `remote`
5. fallback -> `local` using current working directory

If both local and remote appear valid and confidence is low, ask one disambiguation question before mutation.

When channel resolves to `local`, resolve execution backend with this priority:

1. explicit `execution_backend` (if not `auto`)
2. for `inspect`, local Docker backend (`docker_cli`) when compose environment is available and service exists (default `app`)
3. for `inspect`, local host backend (`host_cli`) when `yarn nocobase` is available
4. for `enable/disable`, deterministic fallback chain: `docker_cli -> remote_api -> manual fallback`
5. if both docker and remote_api write paths are unavailable/failed, stop and return rich fallback hints

Fast docker eligibility check for local write actions:

- resolve target port from `target.base_url`
- query compose mapping via `docker compose port <service> 80`
- if target port is not in compose mapping, skip `docker_cli` write path directly and continue with `remote_api` fallback
- this avoids long docker retries against unrelated local instances

Local channel semantics note:

- local writes should try docker CLI first, then remote API fallback before manual guidance
- local inspect/readback should prefer local CLI `pm list` marker JSON
- local API inspect (`pm:list`, `pm:get`) is fallback only when local CLI marker extraction is unavailable

## Verification Rules

- Always capture pre-state in `safe` mode.
- For `enable`, treat success as `enabled=true` in local `pm list` snapshot (or remote `pm:get`).
- For `disable`, treat success as `enabled=false` in local `pm list` snapshot (or remote `pm:get`).
- Poll interval: 2 seconds.
- Default timeout: 90 seconds.
- If timeout occurs, return `pending_verification` with last known state.
- Commands in output must reflect actual backend (`docker compose ...` or `yarn ...` or API routes).
- When `target.mode=auto` includes both `target.app_path` and `target.base_url`, channel should still resolve to `local`.

## Failure Handling

- Missing auth token for remote writes: block and return missing env var name.
- 401/403 from remote API: treat as authentication/authorization issue; refresh login or API key token before retry.
- Plugin not found during disable: stop and return explicit not-found state.
- Local `pm list` marker block missing or invalid JSON: fallback to API inspect/readback and report parse issue in output.
- API unavailable in safe mode: stop mutation; ask for reachable `base_url` or explicit switch to `fast` mode.
- Async mutation uncertainty: never mark success without readback confirmation.
- Backend unavailable (`docker_cli` unavailable + remote fallback unavailable for local write chain, or `remote_api` unavailable for remote channel): return `verification=failed` and rich fallback hints:
- `Plugin manager URL`: `<base_url>/admin/settings/plugin-manager`
- `API keys URL`: `<base_url>/admin/settings/api-keys`
- when `base_url` is unknown, use default `http://127.0.0.1:13000`
- `Manual activation`: enable target plugin in plugin manager UI, restart app, rerun inspect/postcheck
- `Remote API fallback`: when local docker write fails, retry `pm:enable/pm:disable` via target API before manual fallback
- `CLI runtime dependency special case`: enable `@nocobase/plugin-api-doc` and `@nocobase/plugin-api-keys`, restart app, then hand off runtime refresh to `nocobase-env-bootstrap` / `nocobase-acl-manage`
