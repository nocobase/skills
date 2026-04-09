---
name: nocobase-plugin-manage
description: Inspect NocoBase plugin inventory and plugin state from runtime-backed sources, and safely install, enable, or disable plugins for local or remote applications. For local Docker apps, automatically prefer docker-compose CLI execution.
allowed-tools: Bash, Read, Grep, Write
metadata:
  owner: platform-tools
  version: 1.1.0
  last-reviewed: 2026-04-09
  risk-level: medium
---

# Goal

Provide a deterministic V1 workflow for plugin operations that works for both local and remote NocoBase applications, using runtime APIs and existing CLI commands instead of documentation-only sources.

# Scope

- Inspect plugin catalog and plugin state (`enabled`, `installed`, version, package metadata) from runtime-backed sources.
- Install plugins using the existing `pm add` capability.
- Enable plugins using the existing `pm enable` capability.
- Disable plugins using the existing `pm disable` capability.
- Expose a stable invocation contract that other skills can call.
- Return machine-parseable execution and verification results.

# Non-Goals

- Do not modify NocoBase source code.
- Do not introduce new `nocobase pm` subcommands.
- Do not perform destructive removal (`pm remove`) by default.
- Do not scaffold or develop plugin code.
- Do not persist secrets in any skill file.

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `action` | yes | none | one of `inspect/install/enable/disable` | "Which action should I run: inspect, install, enable, or disable?" |
| `target.mode` | no | `auto` | one of `auto/local/remote` | "Should I force local or remote target?" |
| `target.app_path` | no | auto-detected from workspace | existing directory with NocoBase app | "Which local NocoBase app path should I use?" |
| `target.base_url` | no | remote default `http://127.0.0.1:13000` when remote is selected | valid HTTP(S) URL | "What base URL should I query for plugin state?" |
| `target.compose_service` | no | `app` | non-empty docker compose service name | "Which compose service should be used for local Docker CLI?" |
| `auth.token_env` | no | `NOCOBASE_API_TOKEN` | env var exists and non-empty when required | "Which env var contains the access token?" |
| `plugins` | install/enable/disable: yes | none | non-empty array of plugin names/package names | "Which plugin(s) should be changed?" |
| `execution_backend` | no | `auto` | one of `auto/docker_cli/host_cli/remote_api` | "Should I force docker_cli, host_cli, or remote_api?" |
| `options.registry` | install: optional | none | valid URL if provided | "Should install use a custom registry?" |
| `options.version` | install: optional | none | semver, tag, or empty for latest | "Should install pin a specific version?" |
| `options.auth_token_env` | install: optional | none | env var exists when private registry requires token | "Which env var contains registry auth token?" |
| `execution_mode` | no | `safe` | one of `safe/fast` | "Use safe mode (recommended) or fast mode?" |
| `verify.timeout_seconds` | no | `90` | integer in `10..600` | "What verification timeout should I use?" |

Rules:

- Support two invocation styles:
- compact: `Use $nocobase-plugin-manage <action> [plugin...]`
- structured: JSON payload (for cross-skill orchestration)
- Normalize `target.base_url` by removing trailing `/`.
- Accept both short plugin names and full package names where NocoBase parser supports them.
- In `safe` mode, require pre-check and post-check status readback.
- Resolve `target.mode=auto` with this priority:
- explicit `target.base_url` => `remote`
- explicit `target.app_path` => `local`
- if current workspace contains a NocoBase app (for example `.env` and app package metadata), choose `local`
- if `NOCOBASE_BASE_URL` or `APP_BASE_URL` env is set, choose `remote`
- fallback to `local` with current working directory
- Resolve `execution_backend=auto` with this priority:
- if channel is `local` and docker compose is available for `target.app_path`, prefer `docker_cli`
- if channel is `local` and host CLI is available, use `host_cli`
- if channel is `remote`, use `remote_api`
- if local backends are unavailable and remote prerequisites are satisfied, fallback to `remote_api`
- if all backends are unavailable, stop and return rich fallback guidance
- If user says "you decide", use defaults in this table.

Invocation payload template:

```json
{
  "action": "inspect",
  "target": {
    "mode": "auto",
    "app_path": null,
    "base_url": null,
    "compose_service": "app"
  },
  "auth": {
    "token_env": "NOCOBASE_API_TOKEN"
  },
  "execution_backend": "auto",
  "plugins": [],
  "options": {
    "registry": null,
    "version": null,
    "auth_token_env": null
  },
  "execution_mode": "safe",
  "verify": {
    "timeout_seconds": 90
  }
}
```

# Mandatory Clarification Gate

- Max clarification rounds: `2`
- Max questions per round: `3`
- Pre-mutation requirements:
- `action` is resolved.
- target channel is resolved (auto-resolution or explicit).
- For local mode: `target.app_path` exists.
- For remote mode: `target.base_url` is reachable.
- For install/enable/disable: `plugins` is non-empty.
- For remote writes in safe mode: auth token is available.
- For local `docker_cli`: docker compose command is available and target service exists.
- For local `host_cli`: `yarn nocobase` command is available in target app path.
- If both local and remote candidates exist and confidence is low, ask one concise disambiguation question.
- If these are not met, stop mutation and report missing prerequisites.

# Workflow

1. Parse input, support compact action form, and resolve execution channel/backend.
- If input is compact (`Use $nocobase-plugin-manage enable @nocobase/plugin-mcp-server`), normalize into structured payload.
- Apply `target.mode=auto` resolution rules.
- Apply `execution_backend=auto` resolution rules.
- `remote_api`: inspect and mutate through runtime API actions.
- `docker_cli`: mutate through `docker compose exec -T <service> yarn nocobase pm ...`; inspect through app API endpoint when reachable.
- `host_cli`: mutate through host `yarn nocobase pm ...`; inspect through local API endpoint when reachable.

2. Resolve runtime evidence source (never docs as source of truth).
- For full catalog/status, use `pm:list` and `pm:get`.
- For enabled plugin lanes, use `pm:listEnabled` and `pm:listEnabledV2`.
- Record pre-state snapshot before mutation when in `safe` mode.

3. Execute action.
- `inspect`: query state only.
- `install`:
- local `docker_cli`: run `docker compose exec -T <service> yarn nocobase pm add <plugin> [--registry=...] [--version=...] [--auth-token=...]` in `target.app_path`.
- local `host_cli`: run `yarn nocobase pm add <plugin> [--registry=...] [--version=...] [--auth-token=...]` in `target.app_path`.
- remote: call `pm:add` action with `values.packageName` and optional registry/version/auth token.
- `enable`:
- local `docker_cli`: run `docker compose exec -T <service> yarn nocobase pm enable <plugin>` in `target.app_path`.
- local `host_cli`: run `yarn nocobase pm enable <plugin>` in `target.app_path`.
- remote: call `pm:enable` with `filterByTk` (single plugin or plugin array).
- `disable`:
- local `docker_cli`: run `docker compose exec -T <service> yarn nocobase pm disable <plugin>` in `target.app_path`.
- local `host_cli`: run `yarn nocobase pm disable <plugin>` in `target.app_path`.
- remote: call `pm:disable` with `filterByTk`.

4. Verify by readback polling.
- Poll every 2 seconds until timeout.
- For `install`, verify plugin is discoverable in `pm:list` or `pm:get`.
- For `enable`, verify `enabled=true` in `pm:get`.
- For `disable`, verify `enabled=false` in `pm:get`.
- If timeout hits, return `pending_verification` with last observed state.

5. Return a structured result.
- Include `channel`, `commands_or_actions`, `pre_state`, `post_state`, `verification`, and `next_steps`.
- Include `execution_backend` and `target_resolution` evidence (why local/remote and backend were chosen).
- If no backend is available, include `fallback_hints` with UI and command guidance.

Execution channel matrix:

| Mode | Inspect | Install | Enable | Disable |
|---|---|---|---|---|
| `local` | local API (`pm:list`/`pm:get`) | local CLI (`pm add`) | local CLI (`pm enable`) | local CLI (`pm disable`) |
| `remote` | remote API (`pm:list`/`pm:get`) | remote API (`pm:add`) | remote API (`pm:enable`) | remote API (`pm:disable`) |

Execution backend matrix (local):

| Backend | Install | Enable | Disable | When to prefer |
|---|---|---|---|---|
| `docker_cli` | `docker compose exec -T <service> yarn nocobase pm add ...` | `docker compose exec -T <service> yarn nocobase pm enable ...` | `docker compose exec -T <service> yarn nocobase pm disable ...` | local Docker app detected |
| `host_cli` | `yarn nocobase pm add ...` | `yarn nocobase pm enable ...` | `yarn nocobase pm disable ...` | host runtime app without container CLI |

Operational notes:

- `pm:add` does not imply `enabled=true`. It adds package availability; enabling is separate.
- `pm:add`, `pm:enable`, and `pm:disable` in resource actions are asynchronous (`runAsCLI`), so readback polling is mandatory.
- Prefer API-client style URLs (`pm:list`, `pm:get`, `pm:add`, `pm:enable`, `pm:disable`) when a NocoBase API client is available.
- For local Docker environments, prefer `docker_cli` as primary backend.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [references/v1-runtime-contract.md](references/v1-runtime-contract.md) | any action | endpoint and command templates for local/remote flows |
| [references/test-playbook.md](references/test-playbook.md) | running acceptance tests | prompt-driven test cases with expected outcomes |
| [pm.ts](../../nocobase/packages/core/server/src/commands/pm.ts) | implementing install/enable/disable via CLI | confirms `pm add/enable/disable` command signatures |
| [resource.ts](../../nocobase/packages/core/server/src/plugin-manager/options/resource.ts) | implementing inspect or remote mutation | confirms `pm:list/get/listEnabled/add/enable/disable` actions |
| [preset index.ts](../../nocobase/packages/presets/nocobase/src/server/index.ts) | proving plugin info source is runtime-backed | shows `getAllPlugins` and DB merge behavior |
| [client PluginManager.tsx](../../nocobase/packages/core/client/src/pm/PluginManager.tsx) | confirming front-end action routes | uses `pm:list` and `pm:enable` |
| [app PluginManager.ts](../../nocobase/packages/core/client/src/application/PluginManager.ts) | confirming enabled-plugin lane route | uses `pm:listEnabled` |

# Safety Gate

- High-impact actions:
- disabling authentication, ACL, or system-critical plugins
- remote mutations in production-like environments
- multi-plugin batch operations
- Secondary confirmation template:
- "Confirm execution: `{{action}}` for `{{plugins}}` on `{{target.base_url or target.app_path}}`. Type `confirm` to continue."
- In `safe` mode:
- block mutation if pre-state cannot be read
- block mutation if plugin identity is ambiguous
- block mutation if remote token is missing for protected endpoints
- block mutation when all execution backends are unavailable
- Rollback guidance:
- failed disable: run `pm enable <plugin>` (local CLI or remote `pm:enable`)
- failed enable: run `pm disable <plugin>` if rollback is required and explicitly requested
- failed install side effects: keep record, do not auto-remove unless explicitly requested
- Backend unavailable rich guidance template:
- `Local Docker path`: verify `docker compose ps`, verify service name (default `app`), then retry.
- `UI fallback`: open `{{base_url}}/admin/settings/plugin-manager`, enable target plugin manually.
- `MCP plugin special case`: enable `@nocobase/plugin-mcp-server` in plugin manager, restart app, rerun MCP postcheck.
- `Auth fallback`: if endpoint returns `401/403`, open `{{base_url}}/admin/settings/api-keys`, create/regenerate token, set env var, retry.
- If `base_url` is unknown, use default `http://127.0.0.1:13000` when generating fallback URLs.

# Verification Checklist

- Input contract fields are resolved and validated.
- Execution channel (`local` or `remote`) is explicit in output.
- `execution_backend` is explicit in output.
- Auto-resolution decisions are recorded in output assumptions and target resolution evidence.
- Pre-state is captured in `safe` mode.
- Mutation call(s) succeeded without shell/API errors.
- Post-state was fetched by readback polling.
- Expected condition is met (`discoverable` for install, `enabled=true` for enable, `enabled=false` for disable).
- Timeouts are reported as `pending_verification`, not hidden as success.
- CLI/API commands used are included in output for reproducibility.
- Token values are redacted; only env var names are shown.
- Backend unavailable cases return `verification=failed` and include rich `fallback_hints`.
- Any unresolved risk is listed in `next_steps`.

# Minimal Test Scenarios

1. Local inspect: reachable local API returns `pm:list` with plugin states.
2. Remote inspect: authenticated call returns plugin states and enabled lanes.
3. Compact invocation happy path: `Use $nocobase-plugin-manage enable <plugin>` auto-resolves target and succeeds.
4. Local Docker enable happy path: backend resolves to `docker_cli` and command uses `docker compose exec -T app ...`.
5. Local install happy path: `pm add` completes and plugin becomes discoverable.
6. Enable happy path: `pm enable` completes and plugin becomes `enabled=true`.
7. Disable guarded case: attempt to disable critical plugin requires confirmation.
8. Remote mutation failure: missing token blocks mutation with actionable error.
9. Backend unavailable path returns rich manual guidance (plugin manager/API keys URLs and concrete next actions).

# Output Contract

Always return:

- `request`: normalized action and target
- `channel`: chosen execution channel
- `execution_backend`: chosen backend (`docker_cli | host_cli | remote_api`)
- `commands_or_actions`: exact commands or action routes invoked
- `pre_state`: plugin snapshot before mutation (if available)
- `post_state`: plugin snapshot after mutation (or last observed snapshot on timeout)
- `verification`: `passed | failed | pending_verification`
- `assumptions`: defaults applied
- `target_resolution`: explicit reason and signals used to choose local/remote
- `fallback_hints`: rich fallback guidance when backend resolution/execution fails
- `next_steps`: concrete follow-up actions

# References

- [V1 Runtime Contract](references/v1-runtime-contract.md): runtime endpoint and CLI mapping for this skill.
- [Test Playbook](references/test-playbook.md): copy-ready prompts and expected assertions for local/remote flows.
- [NocoBase PM CLI Commands](../../nocobase/packages/core/server/src/commands/pm.ts): confirms supported `pm` operations.
- [NocoBase PM Resource Actions](../../nocobase/packages/core/server/src/plugin-manager/options/resource.ts): confirms inspect and remote mutation actions.
- [Preset Plugin Aggregation](../../nocobase/packages/presets/nocobase/src/server/index.ts): confirms plugin inventory + DB status merge.
- [Client Plugin Manager Actions](../../nocobase/packages/core/client/src/pm/PluginManager.tsx): confirms action route usage from client.
