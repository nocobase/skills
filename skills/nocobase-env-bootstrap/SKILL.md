---
name: nocobase-env-bootstrap
description: "Use when users need to prepare a NocoBase environment, install and start an app, deploy in a single environment, bootstrap MCP connectivity, upgrade a single instance, or diagnose environment-level failures."
argument-hint: "[mode: quick|standard|rescue] [task: preflight|install|deploy|mcp-connect|upgrade|diagnose] [target-dir]"
allowed-tools: Bash, Read, Write, Grep, Glob, WebFetch
owner: platform-tools
version: 1.1.0
last-reviewed: 2026-04-08
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

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `mode` | no | `quick` | one of `quick/standard/rescue` | "Do you want quick mode, standard mode, or rescue mode?" |
| `task` | yes | inferred from user text | one of `preflight/install/deploy/mcp-connect/upgrade/diagnose` | "Should I run preflight, install, deploy, mcp-connect, upgrade, or diagnose?" |
| `install_method` | standard mode for install/deploy | `docker` | one of `docker/create-nocobase-app/git` | "Which installation method do you prefer?" |
| `release_channel` | install or upgrade | `latest` | one of `latest/beta/alpha` | "Which release channel should be used?" |
| `target_dir` | install/deploy | current directory | writable path | "Where should the project be created or operated?" |
| `db_mode` | docker install/deploy | `bundled` | one of `bundled/existing` | "Use bundled database or connect existing database?" |
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
- Never run `mcp-connect` until MCP endpoint scope, auth mode, and required auth inputs are resolved.
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
- Block execution if any `fail` exists.

3. Execute by mode.
- `quick`: Docker-first path with minimal questions.
- `standard`: user chooses method and database mode.
- `rescue`: collect diagnostics (`powershell -File scripts/collect-diagnostics.ps1` on Windows, `bash scripts/collect-diagnostics.sh` on Linux/macOS), map findings to troubleshooting entries, then apply the smallest safe fix first.

4. Execute task-specific runbook.
- For install/deploy: follow [Install Runbook](references/install-runbook.md).
- For `mcp-connect`: follow [MCP Runbook](references/mcp-runbook.md).
- For upgrade: follow [Upgrade Runbook](references/upgrade-runbook.md).
- For diagnose: follow [Troubleshooting KB](references/troubleshooting.md).

5. Run post-check gate.
- Verify service availability, login path, basic plugin/runtime health, and error logs.
- If `mcp_required=true`, verify MCP endpoint reachability and auth path. If `MCP Server` or `API Keys` plugin is not activated, stop and instruct user to activate plugin manually before continuing.
- Summarize done steps, pending steps, and next actions.

6. Report output.
- Include command list executed.
- Include evidence of success/failure from command output.
- For every write action (for example `.env`, compose file, or runtime config), perform immediate read-after-write readback verification and report expected vs actual values.
- Include MCP verification evidence when MCP is in scope, including endpoint, auth mode, status, and activation blockers.
- For `install/deploy` success paths, the next action must include first-login credentials:
- If root credentials were not explicitly customized, show default `admin@nocobase.com` / `admin123` and remind user to change password after first login.
- If root credentials were customized, show the actual configured login account and password source.
- Include one clear next action.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
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

- Preflight completed and contains zero blocking failures.
- Method and release channel are explicitly confirmed or defaulted.
- Install/deploy commands are recorded and reproducible.
- MCP checks include endpoint probe and auth probe when `mcp_required=true`.
- Any missing activation of `MCP Server` or `API Keys` is reported as blocker with explicit manual activation instruction.
- Upgrade path includes backup confirmation.
- Post-check verifies app reachability and login page.
- Troubleshooting output includes root-cause hypothesis and concrete fix steps.
- Result summary contains completed, pending, and next action items.
- Every write action includes immediate readback evidence in the output.

# Minimal Test Scenarios

1. Quick install on a clean host with Docker available.
2. Preflight with missing Docker and missing Node.
3. MCP preflight detects missing `MCP Server` activation and blocks with manual activation prompt.
4. MCP preflight in API-key mode detects missing `API Keys` activation/token and blocks with manual activation prompt.
5. Upgrade with backup confirmed and successful post-check.
6. Diagnose `Environment mismatch` and produce actionable steps.
7. Diagnose startup failure caused by port conflict and provide fix command.
8. Diagnose startup failure caused by file permission denied (`EACCES`) and provide concrete permission/access fix steps.

# Output Contract

Final response must include:

- selected mode and task
- inputs used (method, channel, directory, port)
- preflight summary (`fail/warn/pass`)
- actions executed
- verification result
- MCP verification (`endpoint`, `auth mode`, `status`, `packages`, `activation blockers`)
- unresolved risks
- recommended next action

For `install/deploy` tasks, `recommended next action` must include:

- login URL
- first-login account and password
- password rotation reminder

# References

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
