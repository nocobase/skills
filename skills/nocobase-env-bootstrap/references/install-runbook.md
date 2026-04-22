# Install Runbook

## Goal

Install and start NocoBase in one environment with minimal friction, then bootstrap local `nb` environment for downstream CLI-first skills.

## Contents

1. Goal
2. Method Selection
3. Quick Mode (Recommended)
4. Standard Mode
5. Post-Install Verification
6. Final CLI Bootstrap Stage (Default)
7. Optional MCP Stage (Explicit Only)
8. Known Pitfalls

## Method Selection

1. Default: Docker
- Best for fast bootstrap and stable reproducibility.

2. Alternative: create-nocobase-app
- Best for low-code development on local host.

3. Alternative: Git source
- Best for source-level development and customization.

## Local Script Entrypoints

Use skill-local scripts and templates directly. Always use **absolute paths** (`<SKILL_ROOT>` = directory of SKILL.md):

```bash
node "<SKILL_ROOT>/scripts/install.mjs" --method <docker|create-nocobase-app|git> --target-dir <dir> --release-channel <latest|beta|alpha> --db-mode <bundled|existing> --db-dialect <postgres|mysql|mariadb> --db-database-mode <existing|create> --db-underscored <true|false> --project-name <name>
```

Do not fetch install command snippets from web pages during execution.

## Local Template Source Priority

1. Docker path: `assets/docker-templates/`
2. create-app/git path: `assets/install-templates/`
3. Always report template source as `local`.

Post-install marker:

- Install script writes `NOCOBASE_INSTALL_METHOD` into the app `.env` file.
- Upgrade script uses this `.env` key when `--method` is omitted (`auto` mode).

## Database Mode Policy

1. `docker` default: `db_mode=bundled` (uses bundled db service template).
2. `docker` with user DB inputs (`DB_HOST` etc.) or explicit `db_mode=existing`: switch to external DB template.
3. `create-nocobase-app` / `git`: always require external DB (`db_mode=existing`), and must use `db_dialect=postgres|mysql|mariadb`.
4. For external DB mode, choose `db_database_mode`:
- `existing`: verify existing database directly.
- `create`: create database first, then run auth/connectivity checks.
5. For local DB hosts (`localhost`, `127.0.0.1`, `::1`, `host.docker.internal`), ask `DB_UNDERSCORED` preference; default to `false` when omitted.
6. When DB is missing, stop and ask user to install PostgreSQL, MySQL, or MariaDB first:
- PostgreSQL: <https://www.postgresql.org/download/>
- MySQL install docs: <https://dev.mysql.com/doc/en/installing.html>
- MySQL downloads: <https://dev.mysql.com/downloads/mysql>
- MariaDB downloads: <https://mariadb.org/download/>

## Docker Release Channel Clarification

For `task=install` with `install_method=docker`:

1. If user explicitly provides `release_channel`, keep it and do not re-ask.
2. If user does not provide channel, ask one short clarification question before install:
- "Docker default is `latest`, but current AI build capabilities are more complete in `alpha`. Install `alpha` now?"
3. Accept only `alpha`, `latest`, or `beta`.
4. If user emphasizes stability/production preference, choose `latest`.
5. Record `release_channel_source` as `user_explicit`, `clarified`, or `default_fallback`.

## Quick Mode (Recommended)

Inputs:

- release channel (`latest`, `beta`, `alpha`)
- for docker when channel is not explicit, ask clarification and recommend `alpha`
- database mode (`bundled` default for docker)
- database dialect (`postgres`, `mysql`, `mariadb`; default `postgres`)
- database bootstrap mode (`db_database_mode`: `existing` or `create`)
- target directory

Flow:

1. Run preflight and confirm zero blockers.
2. Copy local compose template from `assets/docker-templates/` based on `db_mode + db_dialect`.
3. Prepare `.env` with a random `APP_KEY` (required), optional `APP_PORT`, and optional `NOCOBASE_APP_IMAGE`.
4. Start app stack.
5. Verify app is reachable and login page loads.
6. Run Final CLI Bootstrap Stage.

APP_KEY generation examples:

```powershell
$env:APP_KEY = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
```

```bash
export APP_KEY="$(openssl rand -hex 32)"
```

Core command pattern (Docker, recommended when AI build capabilities are needed):

```bash
node "<SKILL_ROOT>/scripts/install.mjs" --method docker --target-dir . --release-channel alpha --db-mode bundled --db-dialect postgres --db-underscored false --project-name my-nocobase
```

## Standard Mode

### A) Docker Path

Required decisions:

- database mode: `bundled` or `existing`
- database dialect:
- bundled mode: `postgres`, `mysql`, or `mariadb`
- existing mode: `postgres`, `mysql`, or `mariadb`
- `db_underscored` preference (default `false`, confirm for local DB hosts)
- release channel
- target directory

Steps:

1. Select local compose template by `db_mode + db_dialect` and copy it to `docker-compose.yml`.
2. Set required environment variables.
- `APP_KEY` must be random and non-placeholder.
- For existing mode, `DB_HOST/DB_PORT/DB_DATABASE/DB_USER/DB_PASSWORD` are required.
- `DB_UNDERSCORED` default is `false` and should be confirmed for local DB hosts.
3. Start services with `docker compose up -d`.
4. Validate app and logs.

### B) create-nocobase-app Path

Steps:

1. Create app project.
2. Install dependencies.
3. Run NocoBase install command.
4. Start dev runtime.

Database requirement:

- Must have reachable PostgreSQL, MySQL, or MariaDB (`db_mode=existing`).
- Required inputs: `DB_HOST/DB_PORT/DB_DATABASE/DB_USER/DB_PASSWORD`.
- Optional input: `DB_UNDERSCORED` (default `false`; confirm for local DB hosts).

Typical command pattern:

```bash
node "<SKILL_ROOT>/scripts/install.mjs" --method create-nocobase-app --target-dir . --release-channel latest --db-mode existing --db-dialect postgres --db-host 127.0.0.1 --db-port 5432 --db-database nocobase --db-user nocobase --db-password your_password --db-underscored false --project-name my-nocobase-app --run-mode none
cd my-nocobase-app
yarn dev
```

Template sources:

- `assets/install-templates/create-app.command.template.txt`

### C) Git Path

Steps:

1. Clone repository.
2. Install dependencies.
3. Prepare `.env`.
4. Run install and start command.

Database requirement:

- Must have reachable PostgreSQL, MySQL, or MariaDB (`db_mode=existing`).
- Required inputs: `DB_HOST/DB_PORT/DB_DATABASE/DB_USER/DB_PASSWORD`.
- Optional input: `DB_UNDERSCORED` (default `false`; confirm for local DB hosts).

Typical command pattern:

```bash
node "<SKILL_ROOT>/scripts/install.mjs" --method git --target-dir . --release-channel latest --db-mode existing --db-dialect postgres --db-host 127.0.0.1 --db-port 5432 --db-database nocobase --db-user nocobase --db-password your_password --db-underscored false --project-name my-nocobase --run-mode none
cd my-nocobase
yarn dev
```

Template sources:

- `assets/install-templates/git.clone.command.template.txt`
- `assets/install-templates/git.env.template`

## Post-Install Verification

1. App process/container is running.
2. App URL is reachable.
3. Login page is available.
4. No blocking errors in runtime logs.
5. Prepare a concrete next-step login instruction with account/password for first sign-in.

Next-step instruction rule:

1. If initial root credentials are not customized in install flow, use default credentials:
- Account: `nocobase`
- Password: `admin123`
2. If root credentials are customized by env/flags, output configured account and password source.
3. Always add password rotation reminder after first successful login.

## Final CLI Bootstrap Stage (Default)

For install tasks, run this section as the default final stage after app startup.

1. Resolve local API URL:
- `http://localhost:<port>/api`

2. Auth mode behavior:
- default bootstrap mode is oauth.
- oauth mode probes `/.well-known/oauth-authorization-server`, runs `env auth`, then `env update`.
- token mode requires token env (default `NOCOBASE_API_TOKEN`) and keeps strict local-vs-remote token rules.
- in token mode, if no token is available, auto-generate first: `yarn nocobase generate-api-key -n cli_auto_token -u nocobase -r root -e 30d --silent` (or docker compose exec equivalent); only when automatic path fails, ask user to create token manually.

3a. Before running CLI bootstrap in OAuth mode, display login credentials:
- Account: `nocobase` (or configured `INIT_ROOT_EMAIL`)
- Password: `admin123` (or configured `INIT_ROOT_PASSWORD`)
- Tell user: "When the browser opens, log in with the credentials above. The OAuth authorization page will appear automatically after login."
- Do NOT output the app login URL â€?follow the OAuth authorization flow started by `env auth`. If `env auth` prints an authorization URL in command output, use that same URL; outputting a separate login URL risks the user navigating there instead and missing the authorization callback.
- Rationale: `env auth` opens a browser OAuth flow immediately. If the user has no active session, the browser will redirect to the login page first. Showing credentials upfront prevents the user from being stuck on the login page without knowing what to enter.
- Always include password rotation reminder.

4. Run CLI bootstrap command chain:

```bash
nb env add local --api-base-url http://localhost:13000/api -s project
nb env auth local -s project
```

`env auth` is a blocking command that self-terminates when OAuth completes. After printing the authorization URL it blocks waiting for the browser callback. When the user finishes the browser flow, `env auth` exits on its own.
- **REQUIRED**: run `env auth` and do nothing until it exits. No messages, no other commands, no timeout logic.
- **FORBIDDEN**: running `env update` before `env auth` exits; asking the user if they finished; treating a long wait as failure; interrupting the process.

```bash
nb env update local -s project
nb env -s project
```

5. Token mode command sequence:

```bash
nb env add local --api-base-url http://localhost:<port>/api --access-token <token> -s project
nb env update local -s project
nb env -s project
```

## Optional MCP Stage (Explicit Only)

MCP is no longer an automatic final stage.

Only run MCP stage when user explicitly requests `task=mcp-connect`.

When explicit MCP task is requested:

1. Run MCP runbook + post-start validation.
2. Apply fixed activation sequence for endpoint blockers.
3. Generate client template only within explicit MCP task scope.

## Known Pitfalls

1. Port already in use.
2. Missing or weak `APP_KEY` (for example `please-change-me` / `*-secret-key-change-me`).
3. Node/Yarn version mismatch on non-Docker paths.
4. Missing internet access for dependency/plugin download.
5. CLI bootstrap fails because oauth/token dependency plugin bundle is not active, or token mode is selected but token env is missing.
6. `env update` fails because `swagger:get` is unavailable when `@nocobase/plugin-api-doc` is not active.
7. CLI bootstrap succeeds but runtime commands are stale because `env update` was skipped.
8. MCP endpoint `404` because `MCP Server` plugin is not activated (explicit MCP task only).
9. API key auth fails because `API Keys` plugin is not activated or token is stale (explicit MCP task only).
