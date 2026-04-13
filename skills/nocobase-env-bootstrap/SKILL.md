---
name: nocobase-env-bootstrap
description: "Use when users need to prepare a NocoBase environment, install and start an app, deploy in a single environment, bootstrap local nocobase-ctl environment for downstream CLI-based skills, upgrade a single instance, or diagnose environment-level failures."
argument-hint: "[mode: quick|standard|rescue] [task: preflight|install|deploy|upgrade|diagnose|mcp-connect] [target-dir]"
allowed-tools: Bash, Read, Write, Grep, Glob, WebFetch
owner: platform-tools
version: 1.4.1
last-reviewed: 2026-04-13
risk-level: medium
---

# Goal

Help users set up NocoBase smoothly from zero to running by handling environment checks, installation, single-environment deployment, local CLI environment bootstrap, single-instance upgrade, and high-frequency troubleshooting.

# Scope

- Detect host environment and required dependencies automatically when possible.
- Install and initialize NocoBase with Docker, create-nocobase-app, or Git method.
- Deploy and start NocoBase in one environment (local machine or single server).
- After successful install/deploy, automatically bootstrap local `nocobase-ctl` environment (`local`) for downstream CLI-first skills.
- Run safe single-instance upgrades with explicit pre-check and post-check gates.
- Diagnose and fix high-frequency setup and runtime failures.
- Keep MCP materials available for explicit `task=mcp-connect` only.

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
| `task` | yes | inferred from user text | one of `preflight/install/deploy/upgrade/diagnose/mcp-connect` | "Should I run preflight, install, deploy, upgrade, diagnose, or mcp-connect?" |
| `install_method` | standard mode for install/deploy | `docker` | one of `docker/create-nocobase-app/git` | "Which installation method do you prefer?" |
| `release_channel` | install or upgrade | `latest` | one of `latest/beta/alpha` | "Which release channel should be used?" |
| `target_dir` | install/deploy | current directory | writable path | "Where should the project be created or operated?" |
| `db_mode` | docker install/deploy | `bundled` | one of `bundled/existing` | "Use bundled database or connect existing database?" |
| `db_dialect` | docker install/deploy | `postgres` | one of `postgres/mysql/mariadb` | "Use PostgreSQL, MySQL, or MariaDB template?" |
| `port` | no | `13000` | integer 1..65535 | "Which app port should be used?" |
| `network_profile` | no | `online` | one of `online/restricted/offline` | "Can this host access external internet directly?" |
| `cli_env_name` | no | `local` | non-empty slug | "Which local nocobase-ctl env name should be created?" |
| `cli_token_env` | no | `NOCOBASE_API_TOKEN` | valid env variable name | "Which env var stores API token for nocobase-ctl env bootstrap?" |
| `mcp_auth_mode` | only when `task=mcp-connect` | `api-key` | one of `api-key/oauth/none` | "Use API key auth, OAuth auth, or no auth probe?" |
| `mcp_scope` | only when `task=mcp-connect` | `main` | one of `main/non-main` | "Is MCP served from main app or a non-main app?" |
| `mcp_app_name` | when `task=mcp-connect` and `mcp_scope=non-main` | none | non-empty slug | "What is the non-main app name used in MCP endpoint path?" |
| `mcp_url` | optional when `task=mcp-connect` | inferred from scope/app/port | valid HTTP or HTTPS URL | "Do you want to override the default MCP endpoint URL?" |
| `mcp_packages` | optional when `task=mcp-connect` | empty | comma-separated package names | "Should exposed MCP packages be limited via x-mcp-packages?" |
| `mcp_client` | optional when `task=mcp-connect` | `codex` | one of `codex/claude/opencode/vscode/windsurf/cline` | "Which client should be configured for MCP connection commands?" |

Default behavior when user says "you decide":

- `mode=quick`
- `task=install`
- `install_method=docker`
- `release_channel=latest`
- `db_mode=bundled`
- `db_dialect=postgres`
- `port=13000`
- `network_profile=online`
- `cli_env_name=local`
- `cli_token_env=NOCOBASE_API_TOKEN`

# Mandatory Clarification Gate

- Max clarification rounds: `2`
- Max questions per round: `3`
- Never run mutable actions (`install/deploy/upgrade`) until all required inputs for the selected `task` are resolved.
- Never run `mcp-connect` until MCP endpoint scope and auth mode are resolved.
- For install/deploy flows, do not ask users whether to connect MCP by default.
- For install/deploy flows, always run CLI environment bootstrap (`node skills/run-ctl.mjs -- env add ...`) as final stage.
- Before running `env update`, ensure CLI dependency plugins are active: `@nocobase/plugin-api-doc` and `@nocobase/plugin-api-keys`; if missing, enable via `nocobase-plugin-manage` and restart app.
- If `cli_token_env` is missing during CLI bootstrap, attempt automatic token generation first; ask user manually only when automatic path fails.
- If required inputs are missing or ambiguous, stop and ask one short clarification question.
- If any required path is invalid or not writable, stop and request a valid writable path before continuing.

# Workflow

1. Parse request and normalize intent.
- If intent is unclear, ask only one short question to select `task`.
- Keep first round to at most five questions.

2. Run preflight gate before install/deploy/upgrade and before `mcp-connect`.
- For install/deploy/upgrade, run core checks only:
- Windows: execute `powershell -File scripts/preflight.ps1`.
- Linux/macOS: execute `bash scripts/preflight.sh`.
- Classify findings into `fail`, `warn`, and `pass`.
- Treat non-MCP blockers (dependency/runtime/path/network) as immediate blockers.
- For explicit `task=mcp-connect`, follow MCP-specific checks in MCP runbook.

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
- For upgrade: follow [Upgrade Runbook](references/upgrade-runbook.md).
- For diagnose: follow [Troubleshooting KB](references/troubleshooting.md).
- For explicit `mcp-connect`: follow [MCP Runbook](references/mcp-runbook.md).

5. Run post-check gate and bootstrap CLI environment.
- Verify service availability, login path, basic plugin/runtime health, and error logs.
- For install/deploy, app startup and login readiness complete core install flow.
- Ensure CLI dependency plugin bundle is active before CLI runtime refresh:
- `@nocobase/plugin-api-doc`
- `@nocobase/plugin-api-keys`
- Preferred activation path:
- `Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc @nocobase/plugin-api-keys`
- If plugin state changed, restart app before `node skills/run-ctl.mjs -- env update ...`.
- Always run CLI bootstrap as final stage for install/deploy/upgrade:
- Windows: `powershell -File scripts/cli-postcheck.ps1 -Port <port> -EnvName <cli_env_name> -TokenEnv <cli_token_env> -Scope project -BaseDir <target_dir>`
- Linux/macOS: `bash scripts/cli-postcheck.sh <port> <cli_env_name> <cli_token_env> project <target_dir>`
- CLI bootstrap target command:
- `node skills/run-ctl.mjs -- env add --name <cli_env_name> --base-url http://localhost:<port>/api --token <token> -s project`
- After env add succeeds, run runtime refresh for downstream command readiness:
- `node skills/run-ctl.mjs -- env update -e <cli_env_name> -s project`
- Perform immediate readback (`node skills/run-ctl.mjs -- env -s project`) and include expected vs actual values.

6. Optional MCP stage (explicit only).
- Only execute MCP checks/templates when `task=mcp-connect` or user explicitly requests MCP setup.
- Keep existing MCP automation contracts and fixed activation sequence unchanged.
- Do not run MCP stage automatically after install/deploy.

7. Report output.
- Include command list executed.
- Include evidence of success/failure from command output.
- For every write action (for example `.env`, compose file, or runtime config), perform immediate read-after-write verification and report expected vs actual values.
- Include CLI bootstrap evidence:
- `cli_env_name`
- `base_url`
- `scope`
- `env_update_status`
- Include MCP evidence only when MCP stage is explicitly executed.
- For `install/deploy` success paths, include first-login credentials:
- if root credentials were not explicitly customized, show default `admin@nocobase.com` / `admin123` and remind user to rotate password.
- if customized, show configured login account and password source.
- Include one clear next action.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [assets/docker-templates.md](assets/docker-templates.md) | docker install/deploy | local template selector and release-channel mapping |
| [references/preflight-checklist.md](references/preflight-checklist.md) | before install/deploy/upgrade | dependency, path, network, and port checks |
| [references/install-runbook.md](references/install-runbook.md) | install and first startup | docker/create-app/git execution guide |
| [references/upgrade-runbook.md](references/upgrade-runbook.md) | single-instance upgrade | pre-check, execution, post-check, rollback guidance |
| [references/troubleshooting.md](references/troubleshooting.md) | diagnose and recovery | high-frequency issue decision table |
| [references/mcp-runbook.md](references/mcp-runbook.md) | explicit `task=mcp-connect` | endpoint, auth, package scope, and client command guide |
| [references/mcp-call-examples.md](references/mcp-call-examples.md) | explicit MCP execution | `tools/call` wrapper and request examples |
| [references/mcp-tool-shapes.md](references/mcp-tool-shapes.md) | explicit MCP execution | nested `requestBody` and common ACL/data-source calls |
| [references/mcp-client-templates.md](references/mcp-client-templates.md) | explicit MCP execution | fixed templates for codex/claude/opencode/vscode/windsurf/cline |
| [references/mcp-troubleshooting.md](references/mcp-troubleshooting.md) | explicit MCP execution | `-32601`, header mismatch, and status triage |
| [references/mcp-powershell-helpers.md](references/mcp-powershell-helpers.md) | explicit MCP execution on Windows | reusable JSON/SSE parsing and call helpers |

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
- Install/deploy core success is determined by app startup and login readiness.
- CLI final stage runs for install/deploy/upgrade and successfully creates/updates local env via shared wrapper (`node skills/run-ctl.mjs -- env add ...`).
- CLI runtime refresh (`node skills/run-ctl.mjs -- env update ...`) succeeds for the bootstrap env.
- If runtime refresh fails with `swagger:get` 404 or API documentation disabled, skill applies plugin activation sequence and retries.
- Token acquisition path confirms `@nocobase/plugin-api-keys` is active before generating/providing token.
- Readback confirms expected env name/base URL/scope and current env selection.
- Upgrade path includes backup confirmation.
- Post-check verifies app reachability and login page.
- Troubleshooting output includes root-cause hypothesis and concrete fix steps.
- Result summary contains completed, pending, and next action items.
- Every write action includes immediate readback evidence.
- MCP checks are only executed when explicitly requested.

# Minimal Test Scenarios

1. Quick install on a clean host with Docker available, then CLI local env bootstrap runs automatically.
2. Preflight with missing Docker and missing Node.
3. Preflight fails on missing or placeholder-like `APP_KEY`, and passes after random key is set.
4. Install preflight blocks on non-MCP critical issues.
5. CLI bootstrap fails when token is missing, then succeeds after auto-generate/manual token fix.
6. CLI bootstrap detects missing `api-doc`/`api-keys` dependency plugins and emits activation guidance.
7. Upgrade with backup confirmed and successful post-check.
8. Diagnose `Environment mismatch` and produce actionable steps.
9. Diagnose startup failure caused by port conflict and provide fix command.
10. Diagnose startup failure caused by file permission denied (`EACCES`) and provide concrete permission/access fix steps.
11. Docker install in offline mode succeeds using local compose template without WebFetch.
12. Explicit `task=mcp-connect` runs MCP postcheck and activation sequence as documented.

# Output Contract

Final response must include:

- selected mode and task
- inputs used (method, channel, directory, port)
- preflight summary (`fail/warn/pass`)
- actions executed
- verification result
- CLI bootstrap result (`cli_env_name`, `base_url`, `scope`, `env_update_status`)
- unresolved risks
- recommended next action

When MCP is explicitly executed, also include:

- MCP verification (`endpoint`, `auth mode`, `status`, `packages`, `activation blockers`)
- sampled live MCP tool names (if probe succeeds)
- generated MCP client template command/snippet (when `mcp_client` is provided)

For `install/deploy` tasks, `recommended next action` must include:

- login URL
- first-login account and password
- password rotation reminder

# References

- [Usage Guide](references/usage-guide.md): human-readable guide for install, deploy, CLI bootstrap, optional MCP bootstrap, upgrade, and diagnose workflows.
- [Docker Templates](assets/docker-templates.md): local-first compose template selector and release-channel mapping.
- [Preflight Checklist](references/preflight-checklist.md): use before any mutable action.
- [Install Runbook](references/install-runbook.md): use for install and startup flows.
- [Upgrade Runbook](references/upgrade-runbook.md): use for safe single-instance upgrades.
- [Troubleshooting KB](references/troubleshooting.md): use for high-frequency failures.
- [MCP Runbook](references/mcp-runbook.md): use only for explicit MCP connection tasks.
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
