---
name: nocobase-plugin-manage
description: Inspect NocoBase plugin inventory and plugin state from runtime-backed sources, and safely enable or disable plugins for local or remote applications. For local apps, inspect/readback should prefer CLI `pm list` JSON output, while write actions should follow deterministic fallback `docker_cli -> remote_api -> manual`.
allowed-tools: Bash, Read, Grep, Write
metadata:
  owner: platform-tools
  version: 1.3.1
  last-reviewed: 2026-04-18
  risk-level: medium
---

# Goal

Provide a deterministic V1 workflow for plugin operations that works for both local and remote NocoBase applications, using runtime APIs and existing CLI commands instead of documentation-only sources.

# Scope

- Inspect plugin catalog and plugin state (`enabled`, `installed`, version, package metadata) from runtime-backed sources.
- For local inspect/readback, prefer CLI `yarn nocobase pm list` output and parse JSON between `--- BEGIN_PLUGIN_LIST_JSON ---` and `--- END_PLUGIN_LIST_JSON ---`.
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
- Do not use `nocobase-ctl` as execution path for plugin `inspect/enable/disable` actions.

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `action` | yes | none | one of `inspect/enable/disable` | "Which action should I run: inspect, enable, or disable?" |
| `target.mode` | no | `auto` | one of `auto/local/remote` | "Should I force local or remote target?" |
| `target.app_path` | no | auto-detected from workspace | existing directory with NocoBase app | "Which local NocoBase app path should I use?" |
| `target.base_url` | no | remote default `http://127.0.0.1:13000` when remote is selected | valid HTTP(S) URL | "What base URL should I query for plugin state?" |
| `target.compose_service` | no | `app` | non-empty docker compose service name | "Which compose service should be used for local Docker CLI?" |
| `auth.token_env` | no | `NOCOBASE_API_TOKEN` | env var exists and non-empty when required | "Which env var contains the access token?" |
| `plugins` | enable/disable: yes | none | non-empty array of plugin names/package names | "Which plugin(s) should be changed?" |
| `execution_backend` | no | `auto` | one of `auto/docker_cli/host_cli/remote_api` | "Should I force docker_cli, host_cli, or remote_api?" |
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
- if explicit `target.app_path` exists, choose `local` (even when `target.base_url` is also present)
- if explicit `target.base_url` exists and `target.app_path` is absent, choose `remote`
- if current workspace contains a NocoBase app (for example `.env` and app package metadata), choose `local`
- if `NOCOBASE_BASE_URL` or `APP_BASE_URL` env is set, choose `remote`
- fallback to `local` with current working directory
- Resolve `execution_backend=auto` with this priority:
- if channel is `remote`, use `remote_api`
- if channel is `local` and action is `enable/disable`, run fast docker eligibility check first:
- compare `target.base_url` port with `docker compose port <service> 80` mapping in `target.app_path`
- if port mismatches (for example target `19000` while compose maps `13000`), skip docker write path directly
- if channel is `local` and action is `inspect`, prefer local CLI (`docker_cli`, then `host_cli`); API inspect is fallback only when local marker extraction fails
- if channel is `local` and action is `enable/disable`, use fallback chain:
- `docker_cli` first
- then `remote_api` when docker path is unavailable/failed and `target.base_url` + token are ready
- then manual fallback guidance when both paths are unavailable/failed
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
- For enable/disable: `plugins` is non-empty.
- For remote writes in safe mode: auth token is available.
- For local `docker_cli`: docker compose command is available and target service exists.
- For local write fallback to `remote_api`: `target.base_url` and token are available.
- If both local and remote candidates exist and confidence is low, ask one concise disambiguation question.
- If these are not met, stop mutation and report missing prerequisites.

# Workflow

1. Parse input, support compact action form, and resolve execution channel/backend.
- If input is compact (`Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc`), normalize into structured payload.
- Apply `target.mode=auto` resolution rules.
- Apply `execution_backend=auto` resolution rules.
- `remote_api`: inspect and mutate through runtime API actions.
- `docker_cli`: inspect and mutate through `docker compose exec -T <service> yarn nocobase pm ...` (including `pm list`).
- `host_cli`: inspect/readback fallback through host `yarn nocobase pm list` when docker inspect path is unavailable.
- In local channel, `pm list` is the preferred inspect/readback source; API readback is fallback when CLI JSON extraction is unavailable.
- In local channel for write actions, mutation path is deterministic fallback: `docker_cli -> remote_api -> manual`.
- Fast discriminator should avoid slow docker retry when target URL is clearly not served by current compose mapping.

2. Resolve runtime evidence source (never docs as source of truth).
- For local catalog/status, use `yarn nocobase pm list` (or docker compose equivalent) and parse JSON marker block.
- For remote catalog/status, use `pm:list` and `pm:get`.
- For remote enabled plugin lanes, use `pm:listEnabled` and `pm:listEnabledV2`.
- If local CLI output marker block is unavailable, fallback to API (`pm:list`/`pm:get`) and record fallback reason in output.
- Record pre-state snapshot before mutation when in `safe` mode.

3. Execute action.
- `inspect`:
- local `docker_cli`: run `docker compose exec -T <service> yarn nocobase pm list` in `target.app_path`, parse JSON marker block.
- local `host_cli`: run `yarn nocobase pm list` in `target.app_path`, parse JSON marker block.
- remote: query `pm:list` and optionally `pm:listEnabled` lanes.
- `enable`:
- local `docker_cli`: run `docker compose exec -T <service> yarn nocobase pm enable <plugin>` in `target.app_path`.
- if local docker write is unavailable/failed, fallback to remote `pm:enable` when remote prerequisites are ready.
- remote: call `pm:enable` with `filterByTk` (single plugin or plugin array).
- `disable`:
- local `docker_cli`: run `docker compose exec -T <service> yarn nocobase pm disable <plugin>` in `target.app_path`.
- if local docker write is unavailable/failed, fallback to remote `pm:disable` when remote prerequisites are ready.
- remote: call `pm:disable` with `filterByTk`.

4. Verify by readback polling.
- Poll every 2 seconds until timeout.
- For `enable`, verify `enabled=true` in local `pm list` snapshot (or remote `pm:get`).
- For `disable`, verify `enabled=false` in local `pm list` snapshot (or remote `pm:get`).
- If timeout hits, return `pending_verification` with last observed state.

5. Return a structured result.
- Include `channel`, `commands_or_actions`, `pre_state`, `post_state`, `verification`, and `next_steps`.
- Include `execution_backend` and `target_resolution` evidence (why local/remote and backend were chosen).
- If no backend is available, include `fallback_hints` with UI and command guidance.

Execution channel matrix:

| Mode | Inspect | Enable | Disable |
|---|---|---|---|
| `local` | local CLI (`pm list`, parse marker JSON; fallback API if marker parse fails) | `docker_cli -> remote_api -> manual` | `docker_cli -> remote_api -> manual` |
| `remote` | remote API (`pm:list`/`pm:get`) | remote API (`pm:enable`) | remote API (`pm:disable`) |

Execution backend matrix (local):

| Backend | Inspect | Enable | Disable | When to prefer |
|---|---|---|---|---|
| `docker_cli` | `docker compose exec -T <service> yarn nocobase pm list` | `docker compose exec -T <service> yarn nocobase pm enable ...` | `docker compose exec -T <service> yarn nocobase pm disable ...` | local Docker app detected |
| `host_cli` | `yarn nocobase pm list` | inspect/readback only | inspect/readback only | local non-docker inspect fallback |

Operational notes:

- `pm list` CLI output is wrapped by marker lines (`--- BEGIN_PLUGIN_LIST_JSON ---` / `--- END_PLUGIN_LIST_JSON ---`); only the JSON block between markers is considered canonical plugin payload.
- `pm:enable` and `pm:disable` in resource actions are asynchronous (`runAsCLI`), so readback polling is mandatory.
- Remote actions should prefer API-client style URLs (`pm:list`, `pm:get`, `pm:enable`, `pm:disable`) when available.
- For local Docker environments, prefer `docker_cli` as primary write backend.
- For local write actions, when docker path fails, attempt one remote API fallback (`pm:enable/pm:disable`) before manual fallback guidance.
- Local inspect/readback still prefers CLI marker parsing; API inspect/readback remains fallback when marker parsing fails.
- If deterministic local command path is required, set `target.mode=local` and `execution_backend=docker_cli`.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [references/v1-runtime-contract.md](references/v1-runtime-contract.md) | any action | endpoint and command templates for local/remote flows |
| [references/test-playbook.md](references/test-playbook.md) | running acceptance tests | prompt-driven test cases with expected outcomes |
| [pm.ts](../../nocobase/packages/core/server/src/commands/pm.ts) | implementing local CLI inspect/enable/disable | confirms `pm list/enable/disable` command signatures used by this skill |
| [resource.ts](../../nocobase/packages/core/server/src/plugin-manager/options/resource.ts) | implementing inspect or remote mutation | confirms `pm:list/get/listEnabled/enable/disable` actions used by this skill |
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
- Backend unavailable rich guidance template:
- `Local Docker path`: verify `docker compose ps`, verify service name (default `app`), then retry.
- `Remote API fallback`: if local docker write failed, retry via `pm:enable/pm:disable` using `target.base_url` and token env.
- `UI fallback`: open `{{base_url}}/admin/settings/plugin-manager`, enable target plugin manually.
- `CLI runtime dependency special case`: enable `@nocobase/plugin-api-doc` and `@nocobase/plugin-api-keys`, restart app, then hand off runtime refresh to `nocobase-env-bootstrap` / `nocobase-acl-manage`.
- `Auth fallback`: if endpoint returns `401/403`, open `{{base_url}}/admin/settings/api-keys`, create/regenerate token, set env var, retry.
- If `base_url` is unknown, use default `http://127.0.0.1:13000` when generating fallback URLs.

# Verification Checklist

- Input contract fields are resolved and validated.
- Execution channel (`local` or `remote`) is explicit in output.
- `execution_backend` is explicit in output.
- Auto-resolution decisions are recorded in output assumptions and target resolution evidence.
- When both `target.app_path` and `target.base_url` are present under `target.mode=auto`, resolution must remain `local`.
- Pre-state is captured in `safe` mode.
- Mutation call(s) succeeded without shell/API errors.
- Post-state was fetched by readback polling.
- Expected condition is met (`enabled=true` for enable, `enabled=false` for disable).
- Local inspect/readback parsing extracts JSON from marker block (`BEGIN_PLUGIN_LIST_JSON` ... `END_PLUGIN_LIST_JSON`) or explicitly records API fallback reason.
- Timeouts are reported as `pending_verification`, not hidden as success.
- CLI/API commands used are included in output for reproducibility.
- Token values are redacted; only env var names are shown.
- For local write failures, output explicitly records fallback attempts in order: `docker_cli` then `remote_api`.
- Backend unavailable cases return `verification=failed` and include rich `fallback_hints`.
- Any unresolved risk is listed in `next_steps`.

# Minimal Test Scenarios

1. Local inspect: `yarn nocobase pm list` (or docker compose equivalent) succeeds and marker JSON is parsed into plugin states.
2. Remote inspect: authenticated call returns plugin states and enabled lanes.
3. Compact invocation happy path: `Use $nocobase-plugin-manage enable <plugin>` auto-resolves target and succeeds.
4. Local Docker enable happy path: backend resolves to `docker_cli` and command uses `docker compose exec -T app ...`.
5. Enable happy path: `pm enable` completes and plugin becomes `enabled=true`.
6. Disable guarded case: attempt to disable critical plugin requires confirmation.
7. Remote mutation failure: missing token blocks mutation with actionable error.
8. Local write fallback path: docker failure triggers remote API fallback; if both fail, return rich manual guidance.
9. Auto target with both `app_path` and `base_url` resolves to local; write fallback may still use `remote_api` after docker failure.

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
