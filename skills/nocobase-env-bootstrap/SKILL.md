---
name: nocobase-env-bootstrap
description: "Use when users need to prepare a NocoBase environment, install and start an app, deploy in a single environment, bootstrap MCP connectivity, upgrade a single instance, or diagnose environment-level failures."
argument-hint: "[mode: quick|standard|rescue] [task: preflight|install|deploy|mcp-connect|upgrade|diagnose] [target-dir]"
allowed-tools: Bash, Read, Write, Grep, Glob, WebFetch
owner: platform-tools
version: 1.1.1
last-reviewed: 2026-04-10
risk-level: medium
---

# Goal

Help users set up NocoBase smoothly from zero to running by handling environment checks, installation, single-environment deployment, MCP connectivity bootstrap, single-instance upgrade, and high-frequency troubleshooting.

# Scope

- Detect host environment and required dependencies automatically when possible.
- Install and initialize NocoBase with Docker, create-nocobase-app, or Git method.
- Deploy and start NocoBase in one environment (local machine or single server).
- Bootstrap and verify NocoBase MCP connectivity for downstream development workflows.
- Run safe single-instance upgrades with explicit pre-check and post-check gates.
- Diagnose and fix high-frequency setup and runtime failures.

# Non-Goals

- Do not handle cross-environment release workflows.
- Do not orchestrate migration manager or data promotion between environments.
- Do not make irreversible destructive changes (drop database, delete data volumes) without explicit user confirmation.
- Do not hide unknown errors; always show the exact command and captured failure signal.
- Do not assume built-in external-database compose templates exist; use official docs fallback when external DB is explicitly required.

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `mode` | no | `quick` | one of `quick/standard/rescue` | "Do you want quick mode, standard mode, or rescue mode?" |
| `task` | yes | inferred from user text | one of `preflight/install/deploy/mcp-connect/upgrade/diagnose` | "Should I run preflight, install, deploy, mcp-connect, upgrade, or diagnose?" |
| `install_method` | standard mode for install/deploy | `docker` | one of `docker/create-nocobase-app/git` | "Which installation method do you prefer?" |
| `release_channel` | install or upgrade | `latest` | one of `latest/beta/alpha` | "Which release channel should be used?" |
| `target_dir` | install/deploy | current directory | writable path | "Where should the project be created or operated?" |
| `db_mode` | docker install/deploy | `bundled` | one of `bundled/existing` | "Use bundled database or connect existing database?" |
| `db_dialect` | docker install/deploy | `postgres` | one of `postgres/mysql/mariadb` | "Use PostgreSQL, MySQL, or MariaDB template?" |
| `port` | no | `13000` | integer 1..65535 | "Which app port should be used?" |
| `network_profile` | no | `online` | one of `online/restricted/offline` | "Can this host access external internet directly?" |
| `mcp_required` | no | `false` | boolean (`true/false`) | "Should MCP connectivity be validated as a required gate?" |
| `mcp_auth_mode` | when `mcp_required=true` | `api-key` | one of `api-key/oauth/none` | "Use API key auth, OAuth auth, or no auth probe?" |
| `mcp_scope` | when `mcp_required=true` | `main` | one of `main/non-main` | "Is MCP served from main app or a non-main app?" |
| `mcp_app_name` | when `mcp_scope=non-main` | none | non-empty slug | "What is the non-main app name used in MCP endpoint path?" |
| `mcp_url` | no | inferred from scope/app/port | valid HTTP or HTTPS URL | "Do you want to override the default MCP endpoint URL?" |
| `mcp_token_env` | when `mcp_auth_mode=api-key` | `NOCOBASE_API_TOKEN` | valid env variable name | "Which env var stores the API key token?" |
| `mcp_packages` | no | empty | comma-separated package names | "Should exposed MCP packages be limited via x-mcp-packages?" |
| `mcp_client` | no | `codex` | one of `codex/claude` | "Which client should be configured for MCP connection commands?" |

Default behavior when user says "you decide":

- `mode=quick`
- `task=install`
- `install_method=docker`
- `release_channel=latest`
- `db_mode=bundled`
- `db_dialect=postgres`
- `port=13000`
- `network_profile=online`
- `mcp_required=false`
- `mcp_auth_mode=api-key`
- `mcp_scope=main`
- `mcp_token_env=NOCOBASE_API_TOKEN`
- `mcp_client=codex`

# Mandatory Clarification Gate

- Max clarification rounds: `2`
- Max questions per round: `3`
- Never run mutable actions (`install/deploy/upgrade`) until all required inputs for the selected `task` are resolved.
- Never run `mcp-connect` until MCP endpoint scope and auth mode are resolved.
- For API-key mode, token value collection is deferred; request token only when gate emits `action_required: provide_api_token` after endpoint blocker is cleared.
- If required inputs are missing or ambiguous, stop and ask one short clarification question.
- If any required path is invalid or not writable, stop and request a valid writable path before continuing.

# Workflow

1. Parse request and normalize intent.
- If intent is unclear, ask only one short question to select `task`.
- Keep first round to at most five questions.

2. Run preflight gate before install/deploy/upgrade and before `mcp-connect` when `mcp_required=true`.
- Windows: execute `powershell -File scripts/preflight.ps1` and pass MCP flags when needed.
- Linux/macOS: execute `bash scripts/preflight.sh` and pass MCP env flags when needed.
- Classify findings into `fail`, `warn`, and `pass`.
- Block execution if any `fail` exists, with one MCP bootstrap exception.
- For `task=mcp-connect`, if failures are only MCP activation/auth blockers (`MCP-ENDPOINT-*`, `MCP-AUTH-APIKEY-*`), continue to MCP post-start state machine and auto-run fixed sequence first.
- For the MCP exception path, do not force manual plugin activation before `Use $nocobase-plugin-manage enable <activation_plugin_bundle> -> restart app -> rerun mcp-postcheck` is attempted.
- If any non-MCP blocker exists (dependency/runtime/path/network), stop immediately.

3. Execute by mode.
- `quick`: Docker-first path with minimal questions.
- `standard`: user chooses method and database dialect.
- `rescue`: collect diagnostics (`powershell -File scripts/collect-diagnostics.ps1` on Windows, `bash scripts/collect-diagnostics.sh` on Linux/macOS), map findings to troubleshooting entries, then apply the smallest safe fix first.
- Docker compose source policy for install/deploy:
- Use local templates from `assets/docker-templates/` first.
- If required local template is missing, use WebFetch to official docs only as fallback.
- Always report whether compose came from `local` or `web-fallback`.

4. Execute task-specific runbook.
- For install/deploy: follow [Install Runbook](references/install-runbook.md).
- For `mcp-connect`: follow [MCP Runbook](references/mcp-runbook.md).
- For upgrade: follow [Upgrade Runbook](references/upgrade-runbook.md).
- For diagnose: follow [Troubleshooting KB](references/troubleshooting.md).

5. Run post-check gate.
- Verify service availability, login path, basic plugin/runtime health, and error logs.
- If `mcp_required=true`, run startup-complete MCP gate:
- Windows: execute `powershell -File scripts/mcp-postcheck.ps1` and pass MCP flags.
- Linux/macOS: execute `bash scripts/mcp-postcheck.sh` and pass MCP env flags.
- If MCP gate fails with `action_required: activate_plugin`, do not ask user to manually activate first; run fixed auto sequence first.
- For MCP plugin activation, MUST use `nocobase-plugin-manage` compact invocation `Use $nocobase-plugin-manage enable <activation_plugin_bundle>` (runtime maps to `pm:enable`).
- Activation plugin bundle is auth-mode aware:
- `api-key` (default): `@nocobase/plugin-mcp-server @nocobase/plugin-api-keys`
- `oauth`: `@nocobase/plugin-mcp-server @nocobase/plugin-idp-oauth`
- `none`: `@nocobase/plugin-mcp-server`
- Do not bypass `nocobase-plugin-manage` with ad-hoc container shell plugin commands.
- `nocobase-plugin-manage` may auto-select docker CLI internally for local Docker apps.
- When gate output contains `action_required: activate_plugin`, execute fixed sequence only:
- 1) enable plugin bundle via `Use $nocobase-plugin-manage enable <activation_plugin_bundle>`
- 2) restart app immediately
- 3) rerun `mcp-postcheck`
- Do not run alternative diagnosis or route-guessing before the fixed sequence above is completed.
- If plugin-manage returns backend unavailable/unreachable, propagate rich fallback hints directly:
- include plugin manager URL and API keys URL
- include concrete manual activation steps and rerun command
- After MCP plugin activation, if endpoint still returns `404` or `503`, keep restart + postcheck loop until gate is no longer blocked.
- When gate output contains `action_required: provide_api_token`, stop automation immediately and require user manual action.
- For token step, do not attempt automatic API key creation or token retrieval via CLI/API/DB/UI automation.
- Required token flow: user opens API keys page, clicks `Add API Key`, copies token, and sends token value in chat.
- Manual plugin activation is fallback-only and allowed only when `nocobase-plugin-manage` runtime action path is unavailable or failed after at least one explicit attempt.
- Fallback plugin URL: `{{app_url}}/admin/settings/plugin-manager` (enable auth-mode bundle: MCP + API Keys for `api-key`, MCP + IdP: OAuth for `oauth`)
- Token URL is required only for `action_required: provide_api_token`: `{{app_url}}/admin/settings/api-keys` (click `Add API Key` and create token)
- If API key is missing/invalid, ask user to copy token from admin and send token value back, then set `mcp_token_env` and rerun `mcp-postcheck`.
- Do not continue any MCP-dependent development step until `mcp-postcheck` passes.
- After `mcp-postcheck` passes (or MCP verification passes in install/deploy flow), do one lightweight live capability probe (`tools/list`; if required, initialize then list once) and use the returned tool names to generate next-step guidance.
- Keep this step minimal: no extra large scripts, no heavy diagnostics, no static capability template.
- Do not claim unsupported capabilities; when live probe fails, explicitly say capability fetch failed and provide conservative generic examples.
- Onboarding guidance must include:
- 1) one short starter sentence.
- 2) up to 5 concrete next-step examples (model/table, permissions, page/view, workflow/notification, statistics/report), prioritized by discovered tools.
- 3) safety notes (write permission, destructive-change confirmation, alpha caution).
- 4) one immediate CTA (offer a 3-minute minimal experience).
- Summarize done steps, pending steps, and next actions.

6. Report output.
- Include command list executed.
- Include evidence of success/failure from command output.
- For every write action (for example `.env`, compose file, or runtime config), perform immediate read-after-write readback verification and report expected vs actual values.
- Include MCP verification evidence when MCP is in scope, including endpoint, auth mode, status, and activation blockers.
- If MCP verification passed, include mandatory `mcp_capability_onboarding` section and add sampled live tool names when probe succeeds.
- If there are manual blockers, include clickable/manual action URLs and exact steps.
- For `install/deploy` success paths, the next action must include first-login credentials:
- If root credentials were not explicitly customized, show default `admin@nocobase.com` / `admin123` and remind user to change password after first login.
- If root credentials were customized, show the actual configured login account and password source.
- Include one clear next action.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [assets/docker-templates.md](assets/docker-templates.md) | docker install/deploy | local template selector and release-channel mapping |
| [references/preflight-checklist.md](references/preflight-checklist.md) | before install/deploy/upgrade | dependency, path, network, and port checks |
| [references/install-runbook.md](references/install-runbook.md) | install and first startup | docker/create-app/git execution guide |
| [references/mcp-runbook.md](references/mcp-runbook.md) | mcp-connect and post-install MCP bootstrap | endpoint, auth, package scope, and client command guide |
| [references/upgrade-runbook.md](references/upgrade-runbook.md) | single-instance upgrade | pre-check, execution, post-check, rollback guidance |
| [references/troubleshooting.md](references/troubleshooting.md) | diagnose and recovery | high-frequency issue decision table |

# Safety Gate

High-impact actions:

- modifying running service version
- changing runtime environment variables
- restarting production-like services
- replacing or removing compose services

Safety rules:

- Require explicit confirmation before any upgrade action.
- Require backup confirmation before upgrade.
- Never run destructive delete commands automatically.
- If commands fail, stop and surface exact failure output before next action.

Confirmation template:

- "Confirm execution: `{{task}}` on `{{target}}` with method `{{install_method}}`. Impact: runtime may restart and service may be briefly unavailable. Reply `confirm` to continue."

# Verification Checklist

- Preflight completed and contains zero unresolved non-MCP blocking failures.
- Preflight fails when `APP_KEY` is missing, placeholder-like, too short, or whitespace-containing.
- Method and release channel are explicitly confirmed or defaulted.
- Install/deploy commands are recorded and reproducible.
- MCP checks include endpoint probe and auth probe when `mcp_required=true`.
- Missing MCP/auth companion activation is handled by fixed auto sequence first (`Use $nocobase-plugin-manage enable <activation_plugin_bundle> -> restart app -> rerun mcp-postcheck`); manual plugin activation is fallback only.
- Missing/invalid API key remains a manual blocker and requires user-provided token.
- MCP `activate_plugin` blocker follows fixed sequence: `Use $nocobase-plugin-manage enable <activation_plugin_bundle> -> restart app -> rerun mcp-postcheck`.
- MCP post-start gate (`mcp-postcheck`) is executed for MCP-required flows and passes before downstream MCP-dependent actions.
- A lightweight live `tools/list` probe is executed after MCP pass, and onboarding examples are derived from live tools when available.
- Upgrade path includes backup confirmation.
- Post-check verifies app reachability and login page.
- Troubleshooting output includes root-cause hypothesis and concrete fix steps.
- Result summary contains completed, pending, and next action items.
- Every write action includes immediate readback evidence in the output.

# Minimal Test Scenarios

1. Quick install on a clean host with Docker available.
2. Preflight with missing Docker and missing Node.
3. Preflight fails on missing or placeholder-like `APP_KEY`, and passes after random key is set.
4. MCP preflight detects missing MCP/auth companion activation and outputs auto fixed sequence (`Use $nocobase-plugin-manage enable <activation_plugin_bundle> -> restart -> rerun postcheck`), without asking manual activation first.
5. MCP preflight/postcheck in API-key mode only asks manual action after endpoint is ready and token is missing/invalid.
6. Upgrade with backup confirmed and successful post-check.
7. Diagnose `Environment mismatch` and produce actionable steps.
8. Diagnose startup failure caused by port conflict and provide fix command.
9. Diagnose startup failure caused by file permission denied (`EACCES`) and provide concrete permission/access fix steps.
10. Docker install in offline mode succeeds using local compose template without WebFetch.
11. MCP post-start gate fails with `404`, triggers fixed auto sequence (`Use $nocobase-plugin-manage enable <activation_plugin_bundle> -> restart -> rerun postcheck`) before any manual fallback.
12. MCP post-start gate fails with `401/403`, requests token refresh, then passes after user provides new token.
13. MCP post-start gate passes, live `tools/list` probe returns tools, and onboarding examples are generated from live tool list (not static template).
14. MCP post-start gate passes but live probe cannot fetch tools; onboarding falls back with explicit warning.

# Output Contract

Final response must include:

- selected mode and task
- inputs used (method, channel, directory, port)
- preflight summary (`fail/warn/pass`)
- actions executed
- verification result
- MCP verification (`endpoint`, `auth mode`, `status`, `packages`, `activation blockers`)
- sampled live MCP tool names (if probe succeeds)
- manual action URLs (`plugin manager`, `api-keys page`) when user intervention is required
- unresolved risks
- recommended next action

For `install/deploy` tasks, `recommended next action` must include:

- login URL
- first-login account and password
- password rotation reminder

# References

- [Usage Guide](references/usage-guide.md): human-readable guide for install, deploy, MCP bootstrap, upgrade, and diagnose workflows.
- [Docker Templates](assets/docker-templates.md): local-first compose template selector and release-channel mapping.
- [Preflight Checklist](references/preflight-checklist.md): use before any mutable action.
- [Install Runbook](references/install-runbook.md): use for install and startup flows.
- [MCP Runbook](references/mcp-runbook.md): use for MCP endpoint and client connection bootstrap.
- [Upgrade Runbook](references/upgrade-runbook.md): use for safe single-instance upgrades.
- [Troubleshooting KB](references/troubleshooting.md): use for high-frequency failures.
- [NocoBase MCP](https://docs.nocobase.com/cn/ai-employees/mcp/): endpoint, auth mode, and MCP client integration references. [verified: 2026-04-08]
- [NocoBase Docker Installation](https://docs.nocobase.com/cn/get-started/installation/docker): primary Docker install reference. [verified: 2026-04-08]
- [NocoBase Production Deployment](https://docs.nocobase.com/cn/get-started/deployment/production): production deployment constraints. [verified: 2026-04-08]
- [NocoBase Docker Upgrading](https://docs.nocobase.com/cn/get-started/upgrading/docker): Docker upgrade constraints and sequence. [verified: 2026-04-08]
- [NocoBase create-nocobase-app Installation](https://docs.nocobase.com/cn/get-started/installation/create-nocobase-app): create-app bootstrap path. [verified: 2026-04-08]
- [NocoBase Git Installation](https://docs.nocobase.com/cn/get-started/installation/git): source-code install path. [verified: 2026-04-08]
- [NocoBase Environment Variables](https://docs.nocobase.com/cn/get-started/installation/env): runtime env configuration references. [verified: 2026-04-08]
- [Docker Install Docs](https://docs.docker.com/get-started/get-docker/): Docker setup guidance for missing dependency. [verified: 2026-04-08]
- [Node.js Downloads](https://nodejs.org/en/download): Node.js installation reference. [verified: 2026-04-08]
- [Git Install](https://git-scm.com/install): Git installation reference. [verified: 2026-04-08]
- [Yarn Classic Install](https://classic.yarnpkg.com/lang/en/docs/install/): Yarn 1.x installation reference. [verified: 2026-04-08]
