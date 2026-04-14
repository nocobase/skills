# Install Runbook

## Goal

Install and start NocoBase in one environment with minimal friction, then bootstrap local `nocobase-ctl` environment for downstream CLI-first skills.

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

## Docker Template Source Priority

1. First choice: local templates from `assets/docker-templates/`.
2. Fallback only: official Docker docs via WebFetch when a required local template is missing.
3. Always report template source in output (`local` or `web-fallback`).

## Quick Mode (Recommended)

Inputs:

- release channel (`latest`, `beta`, `alpha`)
- database dialect (`postgres`, `mysql`, `mariadb`; default `postgres`)
- target directory

Flow:

1. Run preflight and confirm zero blockers.
2. Copy local compose template from `assets/docker-templates/` based on `db_dialect`.
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

Core command pattern (Docker):

```bash
docker compose pull
docker compose up -d
docker compose logs --tail=200 app
```

## Standard Mode

### A) Docker Path

Required decisions:

- database dialect: `postgres`, `mysql`, or `mariadb`
- release channel
- target directory

Steps:

1. Select local compose template by database dialect and copy it to `docker-compose.yml`.
2. Set required environment variables. `APP_KEY` must be random and non-placeholder. `DB_DIALECT` is usually provided by the selected compose template, and may be overridden only when intentionally needed.
3. Start services with `docker compose up -d`.
4. Validate app and logs.

### B) create-nocobase-app Path

Steps:

1. Create app project.
2. Install dependencies.
3. Run NocoBase install command.
4. Start dev runtime.

Typical command pattern:

```bash
yarn create nocobase-app my-nocobase
cd my-nocobase
yarn install
yarn nocobase install --lang=zh-CN
yarn dev
```

### C) Git Path

Steps:

1. Clone repository.
2. Install dependencies.
3. Prepare `.env`.
4. Run install and start command.

Typical command pattern:

```bash
git clone https://github.com/nocobase/nocobase.git my-nocobase
cd my-nocobase
yarn install
yarn nocobase install
yarn dev
```

## Post-Install Verification

1. App process/container is running.
2. App URL is reachable.
3. Login page is available.
4. No blocking errors in runtime logs.
5. Prepare a concrete next-step login instruction with account/password for first sign-in.

Next-step instruction rule:

1. If initial root credentials are not customized in install flow, use default credentials:
- Account: `admin@nocobase.com`
- Password: `admin123`
2. If root credentials are customized by env/flags, output configured account and password source.
3. Always add password rotation reminder after first successful login.

## Final CLI Bootstrap Stage (Default)

For install/deploy tasks, run this section as the default final stage after app startup.

1. Resolve local API URL:
- `http://localhost:<port>/api`

2. Ensure CLI dependency plugin bundle is active before runtime refresh:
- `@nocobase/plugin-api-doc`
- `@nocobase/plugin-api-keys`
- Preferred activation command:
- `Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc @nocobase/plugin-api-keys`
- If plugin state changed, restart app before running CLI bootstrap chain.

3. Ensure token env exists (default `NOCOBASE_API_TOKEN`).
- If missing, `cli-postcheck` will try automatic API key generation first (local `yarn nocobase generate-api-key`, then `docker compose exec` fallback).
- Only if automatic path fails, fallback to manual token creation/export.
- If env URL is local (`localhost`, `127.0.0.1`, `::1`, `*.localhost`, `host.docker.internal`), env-manage must auto-acquire a usable token and still run strict connectivity verification.
- If env URL is remote, manual token is mandatory.

4. Run CLI bootstrap command chain:

```bash
node ./env-manage.mjs add --name local --url http://localhost:13000/api --scope project --base-dir .
node ./env-manage.mjs current --scope project --base-dir .
```

Note: `env-manage add` now always includes `env update` connectivity verification internally.

5. Scripted command pattern:

Windows:

```powershell
powershell -File scripts/cli-postcheck.ps1 -Port 13000 -EnvName local -TokenEnv NOCOBASE_API_TOKEN -Scope project -BaseDir .
```

Linux/macOS:

```bash
bash scripts/cli-postcheck.sh 13000 local NOCOBASE_API_TOKEN project .
```

## Optional MCP Stage (Explicit Only)

MCP is no longer an automatic final stage.

Only run MCP stage when user explicitly requests `task=mcp-connect`.

When explicit MCP task is requested:

1. Run MCP runbook + postcheck.
2. Apply fixed activation sequence for endpoint blockers.
3. Generate client template only within explicit MCP task scope.

## Known Pitfalls

1. Port already in use.
2. Missing or weak `APP_KEY` (for example `please-change-me` / `*-secret-key-change-me`).
3. Node/Yarn version mismatch on non-Docker paths.
4. Missing internet access for dependency/plugin download.
5. CLI bootstrap fails because token env is missing or `@nocobase/plugin-api-keys` is not active.
6. `env update` fails because `swagger:get` is unavailable when `@nocobase/plugin-api-doc` is not active.
7. CLI bootstrap succeeds but runtime commands are stale because `env update` was skipped.
8. MCP endpoint `404` because `MCP Server` plugin is not activated (explicit MCP task only).
9. API key auth fails because `API Keys` plugin is not activated or token is stale (explicit MCP task only).
