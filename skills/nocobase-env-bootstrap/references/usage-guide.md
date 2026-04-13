# NocoBase Env Bootstrap Usage Guide

## What This Skill Does

`nocobase-env-bootstrap` helps with:

- preflight checks
- install and deploy in a single environment
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
- `release_channel=latest`
- `port=13000`
- `cli_env_name=local`
- `cli_token_env=NOCOBASE_API_TOKEN`

The default flow does **not** ask whether MCP should be connected.

## Docker Local-First Rule

For Docker install/deploy, use local templates first:

- `assets/docker-templates/docker-compose.postgres.yml`
- `assets/docker-templates/docker-compose.mysql.yml`
- `assets/docker-templates/docker-compose.mariadb.yml`

Only use WebFetch to official docs when a required local template is missing.

## Quick Install Flow

1. Run preflight and ensure no blocking failure.
2. Pick local compose template by `db_dialect`.
3. Set required variables (`APP_KEY` required and random, optional `APP_PORT`, optional `NOCOBASE_APP_IMAGE`).
4. Run `docker compose pull` and `docker compose up -d`.
5. Verify logs and login URL.
6. Run CLI bootstrap final stage:
- ensure dependency plugins are active first:
  - `@nocobase/plugin-api-doc`
  - `@nocobase/plugin-api-keys`
  - preferred command: `Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc @nocobase/plugin-api-keys`
  - if plugin state changed, restart app before `env update`
- `node skills/run-ctl.mjs -- env add --name local --base-url http://localhost:13000/api --token <token> -s project`
- `node skills/run-ctl.mjs -- env update -e local -s project`

APP_KEY examples:

```powershell
$env:APP_KEY = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
```

```bash
export APP_KEY="$(openssl rand -hex 32)"
```

## Final CLI Bootstrap Stage (Default On)

For install/deploy/upgrade flows, local CLI bootstrap is executed as the final stage by default.

Windows:

```powershell
powershell -File scripts/cli-postcheck.ps1 -Port 13000 -EnvName local -TokenEnv NOCOBASE_API_TOKEN -Scope project -BaseDir .
```

Linux/macOS:

```bash
bash scripts/cli-postcheck.sh 13000 local NOCOBASE_API_TOKEN project .
```

CLI bootstrap responsibilities:

- ensure runtime dependency plugins (`api-doc`, `api-keys`) are active
- add or update local env definition (`env add`)
- refresh runtime command cache (`env update`)
- read back configured env (`env -s project`)

If token env is missing, `cli-postcheck` now tries automatic token generation first; only when that fails should you manually activate `@nocobase/plugin-api-keys` and provide token.

## Optional MCP Flow (Explicit Only)

MCP setup is no longer automatic in install/deploy.

Run MCP flow only when user explicitly requests `task=mcp-connect`.

For explicit MCP task:

- follow [MCP Runbook](mcp-runbook.md)
- run `scripts/mcp-postcheck.ps1` or `scripts/mcp-postcheck.sh`
- use fixed activation sequence when endpoint is not ready

## First Login Reminder

If root credentials were not customized, provide:

- account: `admin@nocobase.com`
- password: `admin123`

Then remind users to rotate the password immediately.
