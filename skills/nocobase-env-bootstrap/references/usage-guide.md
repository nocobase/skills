# NocoBase Env Bootstrap Usage Guide

## What This Skill Does

`nocobase-env-bootstrap` helps with:

- preflight checks
- install in a single environment
- app environment management (`task=app-manage`: add/use/current/list)
- upgrade safety gates
- environment troubleshooting
- automatic local CLI environment bootstrap for downstream skills
- optional MCP bootstrap only when user explicitly requests `task=mcp-connect`

## Default Path

If users do not specify details, default behavior is:

- `mode=quick`
- `task=install`
- `install_method=docker`
- `db_mode=bundled`
- `db_dialect=postgres`
- `db_underscored=false`
- `release_channel=latest` (fallback default)
- `port=13000`
- `cli_env_name=local`
- `cli_auth_mode=oauth`
- `cli_token_env=NOCOBASE_API_TOKEN`

The default flow does **not** ask whether MCP should be connected.

For docker install, when user does not explicitly provide `release_channel`, the skill must ask one short clarification first and recommend `alpha` because current AI build capabilities are more complete in alpha.

## Docker Local-First Rule

For Docker install, use local templates first:

- `assets/docker-templates/docker-compose.postgres.yml`
- `assets/docker-templates/docker-compose.mysql.yml`
- `assets/docker-templates/docker-compose.mariadb.yml`
- `assets/docker-templates/docker-compose.external.postgres.yml`
- `assets/docker-templates/docker-compose.external.mysql.yml`
- `assets/docker-templates/docker-compose.external.mariadb.yml`

Do not switch to web search for installation commands; keep install execution local-script and local-template first.

For create-app and git install, use local templates:

- `assets/install-templates/create-app.command.template.txt`
- `assets/install-templates/git.clone.command.template.txt`
- `assets/install-templates/git.env.template`

Install execution should use local scripts and templates directly; do not search web pages for install command snippets during execution.

Install script writes `NOCOBASE_INSTALL_METHOD` into the app `.env` file (`docker`, `create-nocobase-app`, or `git`) for later upgrade auto-detection.

## Install Script Entrypoints

Windows:

Run these commands from the `nocobase-env-bootstrap` skill root.

```powershell
powershell -File scripts/install.ps1 --method <docker|create-nocobase-app|git> --target-dir <dir> --release-channel <latest|beta|alpha> --db-mode <bundled|existing> --db-dialect <postgres|mysql|mariadb> --db-database-mode <existing|create> --db-underscored <true|false> --project-name <name>
```

Linux/macOS:

```bash
bash scripts/install.sh --method <docker|create-nocobase-app|git> --target-dir <dir> --release-channel <latest|beta|alpha> --db-mode <bundled|existing> --db-dialect <postgres|mysql|mariadb> --db-database-mode <existing|create> --db-underscored <true|false> --project-name <name>
```

Database policy:

- `docker` default uses bundled DB (`db_mode=bundled`).
- If user provides DB connection inputs on docker path, script auto-switches to `db_mode=existing`.
- `create-nocobase-app` / `git` always require external DB (`db_mode=existing`) with `db_dialect=postgres|mysql|mariadb`.
- For external DB mode, choose `db_database_mode`:
  - `existing`: connect to the provided database directly.
  - `create`: create database first, then connect/verify.
- For local DB hosts (`localhost`, `127.0.0.1`, `::1`, `host.docker.internal`), ask user `DB_UNDERSCORED` preference. Default is `false`.
- If DB is not available, stop and ask user to install one:
  - PostgreSQL: <https://www.postgresql.org/download/>
  - MySQL install docs: <https://dev.mysql.com/doc/en/installing.html>
  - MySQL downloads: <https://dev.mysql.com/downloads/mysql>
  - MariaDB downloads: <https://mariadb.org/download/>

## Quick Install Flow

1. Run preflight and ensure no blocking failure.
2. If docker `release_channel` is missing from user input, ask one short clarification and recommend `alpha`; accept `alpha/latest/beta`.
3. Pick local compose template by `db_mode + db_dialect`.
4. Set required variables (`APP_KEY` required and random, optional `APP_PORT`, optional `NOCOBASE_APP_IMAGE`; for local DB hosts confirm `DB_UNDERSCORED`, default `false`).
5. Run local install script for docker path.
6. Verify logs and login URL.
7. Run CLI bootstrap final stage:
- `nocobase-ctl env add --name local --base-url http://localhost:13000/api -s project`
- `nocobase-ctl env auth -e local -s project`
- `nocobase-ctl env update -e local -s project`
- `nocobase-ctl env -s project`


APP_KEY examples:

```powershell
$env:APP_KEY = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
```

```bash
export APP_KEY="$(openssl rand -hex 32)"
```

Docker install script example (recommended when AI build capabilities are needed):

```bash
bash scripts/install.sh --method docker --target-dir . --release-channel alpha --db-mode bundled --db-dialect postgres --db-underscored false --project-name my-nocobase
```

Docker with existing DB example:

```bash
bash scripts/install.sh --method docker --target-dir . --release-channel alpha --db-mode existing --db-dialect postgres --db-host 127.0.0.1 --db-port 5432 --db-database nocobase --db-user nocobase --db-password your_password --db-underscored false --project-name my-nocobase
```

Preflight examples with explicit method:

```bash
bash scripts/preflight.sh 13000 docker bundled postgres
bash scripts/preflight.sh 13000 docker existing postgres existing
bash scripts/preflight.sh 13000 docker existing postgres create
bash scripts/preflight.sh 13000 create-nocobase-app existing postgres create
bash scripts/preflight.sh 13000 git existing mysql existing
```

## Upgrade Script Entrypoints

`--method` is optional for upgrade. Default is `auto`, and the script resolves method in this order:

1. `.env` key `NOCOBASE_INSTALL_METHOD`
2. project files (`.git + package.json` => `git`; `package.json` => `create-nocobase-app`; compose file => `docker`)
3. fail with explicit error when directory shape is ambiguous or unsupported

Windows:

```powershell
powershell -File scripts/upgrade.ps1 --method <auto|docker|create-nocobase-app|git> --target-dir <dir> --backup-confirmed true --confirm-upgrade true --target-version <version> --restart-mode <manual|dev|start|pm2> --clean-retry <true|false> --allow-dirty <true|false>
```

Linux/macOS:

```bash
bash scripts/upgrade.sh --method <auto|docker|create-nocobase-app|git> --target-dir <dir> --backup-confirmed true --confirm-upgrade true --target-version <version> --restart-mode <manual|dev|start|pm2> --clean-retry <true|false> --allow-dirty <true|false>
```

Examples:

```bash
# Auto-detect method + fixed-version upgrade
node scripts/upgrade.mjs --target-dir . --backup-confirmed true --confirm-upgrade true --target-version 2.1.0-alpha.16

# create-nocobase-app upgrade to specific version
node scripts/upgrade.mjs --method create-nocobase-app --target-dir ./my-nocobase-app --backup-confirmed true --confirm-upgrade true --target-version 2.1.0-alpha.16

# git upgrade with clean-retry fallback
node scripts/upgrade.mjs --method git --target-dir ./my-nocobase --backup-confirmed true --confirm-upgrade true --clean-retry true

# Preview plan without execution
node scripts/upgrade.mjs --target-dir ./my-nocobase --backup-confirmed true --dry-run
```

Upgrade safety rules:

- Backup confirmation is mandatory: `--backup-confirmed true`.
- Upgrade plan confirmation is mandatory for non-dry-run execution: `--confirm-upgrade true`.
- Downgrade is blocked.
- Git path blocks dirty worktree by default (use `--allow-dirty true` only when you accept the risk).
- After core upgrade, check and upgrade third-party plugins.

## Final CLI Bootstrap Stage (Default On)

For install/upgrade flows, local CLI bootstrap is executed as the final stage by default.

OAuth mode (default):
```bash
nocobase-ctl env add --name local --base-url http://localhost:<port>/api -s project
nocobase-ctl env auth -e local -s project
nocobase-ctl env update -e local -s project
nocobase-ctl env -s project
```

Token mode:
```bash
nocobase-ctl env add --name local --base-url http://localhost:<port>/api --token <token> -s project
nocobase-ctl env update -e local -s project
nocobase-ctl env -s project
```

In token mode, if no token is available, auto-generate first:
```bash
# local (create-app/git)
yarn nocobase generate-api-key -n cli_auto_token -u nocobase -r root -e 30d --silent
# docker
docker compose exec -T app yarn nocobase generate-api-key -n cli_auto_token -u nocobase -r root -e 30d --silent
```
Ask user manually only when automatic path fails.

## App Environment Management Task

When user asks to add/switch/check environment directly, use direct `nocobase-ctl` commands:

OAuth add env:
```bash
nocobase-ctl env add --name staging --base-url https://demo.example.com/api -s project
nocobase-ctl env auth -e staging -s project
nocobase-ctl env update -e staging -s project
```

Token add env (remote, manual token via env var):
```bash
nocobase-ctl env add --name staging --base-url https://demo.example.com/api --token <token> -s project
nocobase-ctl env update -e staging -s project
```

Switch env:
```bash
nocobase-ctl env use staging -s project
```

Remove env:
```bash
nocobase-ctl env remove -e staging -s project
```

List / read current:
```bash
nocobase-ctl env list -s project
nocobase-ctl env -s project
```

## Optional MCP Flow (Explicit Only)

MCP setup is no longer automatic in install.

Run MCP flow only when user explicitly requests `task=mcp-connect`.

For explicit MCP task:

- follow [MCP Runbook](mcp-runbook.md)
- run post-start validation steps from MCP runbook
- use fixed activation sequence when endpoint is not ready

## First Login Reminder

If root credentials were not customized, provide:

- account: `admin@nocobase.com`
- password: `admin123`

Then remind users to rotate the password immediately.
