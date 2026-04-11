# NocoBase Env Bootstrap Usage Guide

## What This Skill Does

`nocobase-env-bootstrap` helps with:

- preflight checks
- install and deploy in a single environment
- MCP bootstrap and verification
- upgrade safety gates
- environment troubleshooting

## Default Path

If users do not specify details, default behavior is:

- `mode=quick`
- `task=install`
- `install_method=docker`
- `db_mode=bundled`
- `db_dialect=postgres`
- `release_channel=latest`
- `port=13000`

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

APP_KEY examples:

```powershell
$env:APP_KEY = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
```

```bash
export APP_KEY="$(openssl rand -hex 32)"
```

## MCP Gate

When `mcp_required=true`, run MCP post-start gate after app startup.

Windows:

```powershell
powershell -File scripts/mcp-postcheck.ps1 -Port 13000 -McpAuthMode api-key -McpTokenEnv NOCOBASE_API_TOKEN
```

Linux/macOS:

```bash
MCP_AUTH_MODE=api-key MCP_TOKEN_ENV=NOCOBASE_API_TOKEN bash scripts/mcp-postcheck.sh 13000
```

- If postcheck outputs `action_required: activate_plugin`, run fixed sequence only: `Use $nocobase-plugin-manage enable <activation_plugin_bundle> -> restart app -> rerun postcheck`
- Activation bundle by `mcp_auth_mode`:
- `api-key` (default): `@nocobase/plugin-mcp-server @nocobase/plugin-api-keys`
- `oauth`: `@nocobase/plugin-mcp-server @nocobase/plugin-idp-oauth`
- `none`: `@nocobase/plugin-mcp-server`
- If postcheck outputs `action_required: restart_app`, restart app and rerun postcheck
- Do not bypass `nocobase-plugin-manage` with ad-hoc container shell plugin commands before fixed sequence is completed
- `nocobase-plugin-manage` may auto-select docker CLI internally for local Docker apps
- Only when postcheck outputs `action_required: provide_api_token`, ask user to create/regenerate API key and send token value in chat
- Do not ask for token while endpoint blocker (`404/503`) is unresolved
- Token acquisition must be user-manual; do not auto-create or auto-retrieve token in this flow
- After postcheck passes, generate client config from fixed templates:
- Windows: `powershell -File scripts/render-mcp-client-template.ps1 -Client opencode -BaseUrl http://127.0.0.1:13000 -McpAuthMode api-key -TokenEnv NOCOBASE_API_TOKEN`
- Linux/macOS: `bash scripts/render-mcp-client-template.sh opencode http://127.0.0.1:13000 api-key main '' NOCOBASE_API_TOKEN ''`
- For `opencode`, token placeholder must use `{env:NOCOBASE_API_TOKEN}` and include `Accept: application/json, text/event-stream` in remote headers.

Manual pages:

- `<base_url>/admin/settings/plugin-manager` (fallback only when runtime plugin-manage enable path is unavailable or failed)
- `<base_url>/admin/settings/api-keys` (required for `provide_api_token`; click `Add API Key`)

## First Login Reminder

If root credentials were not customized, provide:

- account: `admin@nocobase.com`
- password: `admin123`

Then remind users to rotate the password immediately.
