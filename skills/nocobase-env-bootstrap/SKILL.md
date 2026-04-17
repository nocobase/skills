---
name: nocobase-env-bootstrap
description: "Use when users need to prepare a NocoBase environment, install and start an app, bootstrap local nocobase-ctl runtime, manage app environments (add/use/current/list), upgrade a single instance, or diagnose environment-level failures."
argument-hint: "[mode: quick|standard|rescue] [task: preflight|install|upgrade|diagnose|app-manage] [target-dir]"
allowed-tools: Bash, Read, Write, Grep, Glob
owner: platform-tools
version: 1.11.0
last-reviewed: 2026-04-16
risk-level: medium
---

# Goal

Help users set up NocoBase smoothly from zero to running by handling environment checks, installation, local CLI environment bootstrap, application environment management, single-instance upgrade, and high-frequency troubleshooting.

# Scope

- Detect host environment and required dependencies automatically when possible.
- Install and initialize NocoBase with Docker, create-nocobase-app, or Git method.
- Start NocoBase in one environment (local machine or single server).
- After successful install, automatically bootstrap local `nocobase-ctl` environment (`local`) for downstream CLI-first skills.
- Provide reusable app environment management actions (`add`, `use`, `current`, `list`) through skill-local wrapper script for downstream skills.
- Run safe single-instance upgrades with explicit pre-check and post-check gates.
- Diagnose and fix high-frequency setup and runtime failures.

# Non-Goals

- Do not handle cross-environment release workflows.
- Do not orchestrate migration manager or data promotion between environments.
- Do not make irreversible destructive changes (drop database, delete data volumes) without explicit user confirmation.
- Do not hide unknown errors; always show the exact command and captured failure signal.
- Do not assume built-in external-database compose templates exist; require explicit user-provided DB connection inputs when external DB is needed.

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `mode` | no | `quick` | one of `quick/standard/rescue` | "Do you want quick mode, standard mode, or rescue mode?" |
| `task` | yes | inferred from user text | one of `preflight/install/upgrade/diagnose/app-manage` | "Should I run preflight, install, upgrade, diagnose, or app-manage?" |
| `install_method` | install optional, upgrade optional | install: `docker`; upgrade: `auto` | one of `auto/docker/create-nocobase-app/git` | "Which installation method should be used?" |
| `release_channel` | install or upgrade | `latest` | one of `latest/beta/alpha` | "Which release channel should be used?" |
| `target_version` | upgrade optional | none | non-empty version or image tag | "Which target version should be upgraded to?" |
| `backup_confirmed` | upgrade required | `false` | must be `true` before upgrade | "Have you completed and confirmed database backup?" |
| `upgrade_confirmed` | upgrade required for non-dry-run | `false` | must be `true` before non-dry-run upgrade | "Please confirm the resolved upgrade method/version/restart plan." |
| `restart_mode` | upgrade optional | `manual` | one of `manual/dev/start/pm2` | "How should app be restarted after upgrade?" |
| `clean_retry` | upgrade git optional | `false` | boolean (`true/false`) | "If git upgrade fails, should clean-retry be enabled?" |
| `allow_dirty` | upgrade git optional | `false` | boolean (`true/false`) | "Allow upgrade on dirty git worktree?" |
| `target_dir` | install/upgrade | current directory | writable path | "Where should the project be created or operated?" |
| `db_mode` | install | `bundled` for docker; `existing` for create/git | one of `bundled/existing` | "Use bundled database or connect existing database?" |
| `db_dialect` | install | `postgres` | one of `postgres/mysql/mariadb` | "Use PostgreSQL, MySQL, or MariaDB?" |
| `db_host` | when `db_mode=existing` | none | non-empty host | "Which DB host should be used?" |
| `db_port` | when `db_mode=existing` | by dialect (`5432`/`3306`) | numeric port | "Which DB port should be used?" |
| `db_database` | when `db_mode=existing` | none | non-empty database name | "Which DB database should be used?" |
| `db_user` | when `db_mode=existing` | none | non-empty user | "Which DB user should be used?" |
| `db_password` | when `db_mode=existing` | none | non-empty password | "Please provide DB password." |
| `db_underscored` | no | `false` | boolean (`true/false`) | "For local DB, should DB_UNDERSCORED be enabled?" |
| `port` | no | `13000` | integer 1..65535 | "Which app port should be used?" |
| `network_profile` | no | `online` | one of `online/restricted/offline` | "Can this host access external internet directly?" |
| `cli_env_name` | no | `local` | non-empty slug | "Which local nocobase-ctl env name should be created?" |
| `cli_auth_mode` | no | `oauth` | one of `oauth/token` | "Use OAuth mode (default) or token mode for CLI env bootstrap?" |
| `cli_token_env` | no | `NOCOBASE_API_TOKEN` | valid env variable name | "Which env var stores API token when token mode is used?" |
| `app_env_action` | only when `task=app-manage` | `current` | one of `add/use/current/list` | "Which app environment action should run: add, use, current, or list?" |
| `app_env_name` | conditional | none | required for `app_env_action=add/use` | "Which environment name should be used?" |
| `app_base_url` | conditional | none | required for `app_env_action=add`; valid HTTP/HTTPS URL | "Which application URL should be used for env add?" |
| `app_scope` | no | `project` | one of `project/global` | "Should this env action use project or global scope?" |
| `app_token` | conditional | none | required when `app_env_action=add` uses token mode with remote URL | "Please provide API token for token-mode remote environment add." |

Default behavior when user says "you decide":

- `mode=quick`
- `task=install`
- `install_method=docker`
- `release_channel=latest`
- `db_mode=bundled`
- `db_dialect=postgres`
- `db_underscored=false`
- `port=13000`
- `network_profile=online`
- `cli_env_name=local`
- `cli_auth_mode=oauth`
- `cli_token_env=NOCOBASE_API_TOKEN`

# Mandatory Clarification Gate

- Max clarification rounds: `2`
- Max questions per round: `3`
- Never run mutable actions (`install/upgrade`) until all required inputs for the selected `task` are resolved.
- Upgrade gate is mandatory:
- `backup_confirmed` must be `true` before running upgrade commands.
- For upgrade, `install_method` defaults to `auto`; resolve method from marker/project files when user does not specify.
- `upgrade_confirmed` must be `true` before non-dry-run upgrade commands.
- If `target_version` is lower than current version, stop (downgrade is not supported).
- For `install_method=git`, block dirty worktree unless `allow_dirty=true`.
- For `task=app-manage`:
- If `app_env_action=add`, require `app_env_name` and `app_base_url`.
- DB policy is mandatory for install:
- `docker` default is `db_mode=bundled`.
- If user provides DB connection inputs on docker path, switch to `db_mode=existing`.
- `create-nocobase-app` and `git` always require `db_mode=existing` plus PostgreSQL/MySQL/MariaDB readiness.
- If DB host is local (`localhost`, `127.0.0.1`, `::1`, `host.docker.internal`), ask for `db_underscored` preference; default to `false` when user does not specify.
- If DB is missing or unreachable for existing mode, stop and provide official install links:
- PostgreSQL: `https://www.postgresql.org/download/`
- MySQL install docs: `https://dev.mysql.com/doc/en/installing.html`
- MySQL downloads: `https://dev.mysql.com/downloads/mysql`
- MariaDB downloads: `https://mariadb.org/download/`
- App env auth-mode rule is mandatory:
- default add mode is `oauth` (unless token args are provided without explicit auth-mode).
- oauth mode requires dependency bundle `@nocobase/plugin-api-doc` + `@nocobase/plugin-idp-oauth` and interactive `env auth`.
- token mode local URL (strict): host in `localhost`, `127.0.0.1`, `::1`, `*.localhost`, or `host.docker.internal` -> token is mandatory but auto-acquired by `env-manage` (never use placeholder token).
- token mode remote URL: token must be manually provided by user (`app_token` or token env).
- For install flows, always run CLI environment bootstrap (`node ./scripts/env-manage.mjs add ...`) as final stage.
- Before running `env update`, ensure CLI dependency plugins are active by auth mode:
- oauth: `@nocobase/plugin-api-doc` + `@nocobase/plugin-idp-oauth`
- token: `@nocobase/plugin-api-doc` + `@nocobase/plugin-api-keys`
- If token mode is used and `cli_token_env` is missing during CLI bootstrap, attempt automatic token generation first; ask user manually only when automatic path fails.
- If required inputs are missing or ambiguous, stop and ask one short clarification question.
- If any required path is invalid or not writable, stop and request a valid writable path before continuing.

# Workflow

1. Parse request and normalize intent.
- If intent is unclear, ask only one short question to select `task`.
- Keep first round to at most five questions.

2. Run preflight gate before install/upgrade.
- For install/upgrade, run core checks only:
- Windows: execute `powershell -File scripts/preflight.ps1 -InstallMethod <install_method> -DbMode <db_mode> -DbDialect <db_dialect> -DbHost <db_host> -DbPort <db_port> -DbDatabase <db_database> -DbUser <db_user> -DbPassword <db_password>`.
- Linux/macOS: execute `bash scripts/preflight.sh <port> <install_method> <db_mode> <db_dialect>` with `DB_HOST/DB_PORT/DB_DATABASE/DB_USER/DB_PASSWORD` in environment.
- Classify findings into `fail`, `warn`, and `pass`.
- Treat dependency/runtime/path/network blockers as immediate blockers.

3. Execute by mode.
- `quick`: Docker-first path with minimal questions.
- `standard`: user chooses method and database dialect.
- `rescue`: collect diagnostics (`powershell -File scripts/collect-diagnostics.ps1` on Windows, `bash scripts/collect-diagnostics.sh` on Linux/macOS), map findings to troubleshooting entries, then apply the smallest safe fix first.
- Install execution policy:
- Use local scripts and templates only.
- Docker path uses `assets/docker-templates/`.
- create-app/git path uses `assets/install-templates/`.
- Do not search web pages for install command snippets during execution.

4. Execute task-specific runbook.
- For install: follow [Install Runbook](references/install-runbook.md).
- For install command execution, use local script:
- Windows: `powershell -File scripts/install.ps1 --method <install_method> --target-dir <target_dir> --release-channel <release_channel> --db-mode <db_mode> --db-dialect <db_dialect> --db-host <db_host> --db-port <db_port> --db-database <db_database> --db-user <db_user> --db-password <db_password> --db-underscored <db_underscored> --project-name <project_name>`
- Linux/macOS: `bash scripts/install.sh --method <install_method> --target-dir <target_dir> --release-channel <release_channel> --db-mode <db_mode> --db-dialect <db_dialect> --db-host <db_host> --db-port <db_port> --db-database <db_database> --db-user <db_user> --db-password <db_password> --db-underscored <db_underscored> --project-name <project_name>`
- For upgrade: follow [Upgrade Runbook](references/upgrade-runbook.md) and execute local script:
- Windows: `powershell -File scripts/upgrade.ps1 --method <install_method|auto> --target-dir <target_dir> --backup-confirmed true --confirm-upgrade true --target-version <target_version> --restart-mode <restart_mode> --clean-retry <clean_retry> --allow-dirty <allow_dirty>`
- Linux/macOS: `bash scripts/upgrade.sh --method <install_method|auto> --target-dir <target_dir> --backup-confirmed true --confirm-upgrade true --target-version <target_version> --restart-mode <restart_mode> --clean-retry <clean_retry> --allow-dirty <allow_dirty>`
- For diagnose: follow [Troubleshooting KB](references/troubleshooting.md).
- For app environment management (`task=app-manage`): follow [App Environment Manage](references/app-env-manage.md).

5. Run post-check gate and bootstrap CLI environment.
- Verify service availability, login path, basic plugin/runtime health, and error logs.
- For install, app startup and login readiness complete core install flow.
- Ensure CLI dependency plugin bundle is active before CLI runtime refresh:
- oauth (default): `@nocobase/plugin-api-doc` + `@nocobase/plugin-idp-oauth`
- token: `@nocobase/plugin-api-doc` + `@nocobase/plugin-api-keys`
- Preferred activation path:
- oauth: `Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc @nocobase/plugin-idp-oauth`
- token: `Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc @nocobase/plugin-api-keys`
- If plugin state changed, restart app before `node ./scripts/run-ctl.mjs -- env update ...`.
- Always run CLI bootstrap as final stage for install/upgrade:
- Windows: `powershell -File scripts/cli-postcheck.ps1 -Port <port> -EnvName <cli_env_name> -AuthMode <cli_auth_mode> -TokenEnv <cli_token_env> -Scope project -BaseDir <target_dir>`
- Linux/macOS: `AUTH_MODE=<cli_auth_mode> bash scripts/cli-postcheck.sh <port> <cli_env_name> <cli_token_env> project <target_dir>`
- CLI bootstrap target command:
- `node ./scripts/env-manage.mjs add --name <cli_env_name> --url http://localhost:<port>/api --auth-mode <cli_auth_mode> --scope project --base-dir <target_dir>`
- After env add succeeds, run runtime refresh for downstream command readiness:
- `node ./scripts/run-ctl.mjs -- env update -e <cli_env_name> -s project`
- Perform immediate readback (`node ./scripts/env-manage.mjs current --scope project --base-dir <target_dir>`) and include expected vs actual values.

6. Report output.
- Include command list executed.
- Include evidence of success/failure from command output.
- For every write action (for example `.env`, compose file, or runtime config), perform immediate read-after-write verification and report expected vs actual values.
- Include CLI bootstrap evidence:
- `cli_env_name`
- `base_url`
- `scope`
- `auth_mode`
- `env_update_status`
- For `task=app-manage`, include app env operation evidence:
- `app_env_action`
- `current_env_name`
- `current_base_url`
- `is_local`
- `auth_mode` (for add)
- `token_mode` (for add)
- For `install` success paths, include first-login credentials:
- if root credentials were not explicitly customized, show default `admin@nocobase.com` / `admin123` and remind user to rotate password.
- if customized, show configured login account and password source.
- Include one clear next action.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [assets/docker-templates.md](assets/docker-templates.md) | docker install | local template selector and release-channel mapping |
| [assets/install-templates.md](assets/install-templates.md) | create-app/git install | local command/env template mapping and channel defaults |
| [references/preflight-checklist.md](references/preflight-checklist.md) | before install/upgrade | dependency, path, network, and port checks |
| [references/install-runbook.md](references/install-runbook.md) | install and first startup | docker/create-app/git execution guide |
| [references/app-env-manage.md](references/app-env-manage.md) | `task=app-manage` | add/use/current/list contract with oauth/token auth-mode policy |
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
- Require `--confirm-upgrade true` before non-dry-run upgrade script execution.
- Never run destructive delete commands automatically.
- If commands fail, stop and surface exact failure output before next action.

Confirmation template:

- "Confirm execution: `{{task}}` on `{{target}}` with method `{{install_method}}`. Impact: runtime may restart and service may be briefly unavailable. Reply `confirm` to continue."

# Verification Checklist

- Preflight completed and contains zero unresolved blocking failures.
- Preflight fails when `APP_KEY` is weak for existing project files, and defers missing `APP_KEY` only for fresh install targets before local install script generation.
- Existing DB mode fails when required DB fields are missing or endpoint is unreachable.
- `create-nocobase-app`/`git` fail preflight when PostgreSQL/MySQL/MariaDB is unavailable.
- Method and release channel are explicitly confirmed or defaulted.
- Install commands are recorded and reproducible.
- Install core success is determined by app startup and login readiness.
- CLI final stage runs for install/upgrade and successfully creates/updates local env via skill-local env helper (`node ./scripts/env-manage.mjs add ...`).
- `task=app-manage` supports `add/use/current/list` through `node ./scripts/env-manage.mjs ...`.
- App env add enforces auth-mode rules correctly (`oauth` default with metadata/auth flow; token mode keeps local-vs-remote token policy).
- App env add is not considered success unless `env update` connectivity verification succeeds.
- CLI runtime refresh (`node ./scripts/run-ctl.mjs -- env update ...`) succeeds for the bootstrap env.
- If runtime refresh fails with `swagger:get` 404 or API documentation disabled, skill applies plugin activation sequence and retries.
- OAuth path confirms `@nocobase/plugin-idp-oauth` is active before OAuth metadata/auth verification.
- Token acquisition path confirms `@nocobase/plugin-api-keys` is active before generating/providing token.
- Readback confirms expected env name/base URL/scope and current env selection.
- Upgrade path includes backup confirmation.
- Upgrade path includes script-level confirmation gate (`--confirm-upgrade true`) after plan readback.
- Post-check verifies app reachability and login page.
- Troubleshooting output includes root-cause hypothesis and concrete fix steps.
- Result summary contains completed, pending, and next action items.
- Every write action includes immediate readback evidence.

# Minimal Test Scenarios

1. Quick install on a clean host with Docker available, then CLI local env bootstrap runs automatically.
2. Preflight with missing Docker and missing Node.
3. Preflight fails on missing or placeholder-like `APP_KEY`, and passes after random key is set.
4. Install preflight blocks on critical issues.
5. CLI bootstrap default oauth path fails when `idp-oauth` is missing, then succeeds after dependency auto-enable/login fix.
6. CLI bootstrap token mode fails when token is missing, then succeeds after auto-generate/manual token fix.
7. Upgrade with method auto-detected, backup confirmed, upgrade plan confirmed, and successful post-check.
8. Diagnose `Environment mismatch` and produce actionable steps.
9. Diagnose startup failure caused by port conflict and provide fix command.
10. Diagnose startup failure caused by file permission denied (`EACCES`) and provide concrete permission/access fix steps.
11. Docker install in offline mode succeeds using local compose template without external docs lookup.
12. Docker install with user-provided DB inputs auto-switches to `db_mode=existing`.
13. create/git preflight fails when DB is unavailable and returns official PostgreSQL/MySQL/MariaDB install links.
14. create/git preflight passes when DB endpoint and auth probe succeed.
15. `task=app-manage` with oauth mode validates metadata/auth flow, runs `env update`, and returns current env info only on full connectivity success.
16. `task=app-manage` with token mode remote URL + missing token fails with clear token-required error.

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

For `install` tasks, `recommended next action` must include:

- login URL
- first-login account and password
- password rotation reminder

# References

- [Usage Guide](references/usage-guide.md): human-readable guide for install, CLI bootstrap, app environment management, upgrade, and diagnose workflows.
- [Docker Templates](assets/docker-templates.md): local-first compose template selector and release-channel mapping.
- [Install Templates](assets/install-templates.md): local command templates for create-app/git plus channel mapping overrides.
- [Preflight Checklist](references/preflight-checklist.md): use before any mutable action.
- [Install Runbook](references/install-runbook.md): use for install and startup flows.
- [App Environment Manage](references/app-env-manage.md): use for app env add/use/current/list operations and oauth/token policy.
- [Upgrade Runbook](references/upgrade-runbook.md): use for safe single-instance upgrades.
- [Troubleshooting KB](references/troubleshooting.md): use for high-frequency failures.
- [NocoBase Docker Installation](https://docs.nocobase.com/cn/get-started/installation/docker): primary Docker install reference. [verified: 2026-04-08]

- [NocoBase Docker Upgrading](https://docs.nocobase.com/cn/get-started/upgrading/docker): Docker upgrade constraints and sequence. [verified: 2026-04-08]
- [NocoBase create-nocobase-app Installation](https://docs.nocobase.com/cn/get-started/installation/create-nocobase-app): create-app bootstrap path. [verified: 2026-04-08]
- [NocoBase Git Installation](https://docs.nocobase.com/cn/get-started/installation/git): source-code install path. [verified: 2026-04-08]
- [NocoBase Environment Variables](https://docs.nocobase.com/cn/get-started/installation/env): runtime env configuration references. [verified: 2026-04-08]
- [Docker Install Docs](https://docs.docker.com/get-started/get-docker/): Docker setup guidance for missing dependency. [verified: 2026-04-08]
- [Node.js Downloads](https://nodejs.org/en/download): Node.js installation reference. [verified: 2026-04-08]
- [Git Install](https://git-scm.com/install): Git installation reference. [verified: 2026-04-08]
- [Yarn Classic Install](https://classic.yarnpkg.com/lang/en/docs/install/): Yarn 1.x installation reference. [verified: 2026-04-08]
- [PostgreSQL Download](https://www.postgresql.org/download/): PostgreSQL installation guide and packages. [verified: 2026-04-15]
- [MySQL Install Docs](https://dev.mysql.com/doc/en/installing.html): MySQL official installation documentation. [verified: 2026-04-15]
- [MySQL Downloads](https://dev.mysql.com/downloads/mysql): MySQL official download page. [verified: 2026-04-15]
- [MariaDB Downloads](https://mariadb.org/download/): MariaDB official download page. [verified: 2026-04-16]
