# Install Runbook

## Goal

Install and start NocoBase in one environment with minimal friction.

## Contents

1. Goal
2. Method Selection
3. Quick Mode (Recommended)
4. Standard Mode
5. Post-Install Verification
6. Post-Install MCP Bootstrap
7. Known Pitfalls

## Method Selection

1. Default: Docker
- Best for fast bootstrap and stable reproducibility.

2. Alternative: create-nocobase-app
- Best for low-code development on local host.

3. Alternative: Git source
- Best for source-level development and customization.

## Quick Mode (Recommended)

Inputs:

- release channel (`latest`, `beta`, `alpha`)
- target directory

Flow:

1. Run preflight and confirm zero blockers.
2. Prepare project directory and compose config from official docs.
3. Start app stack.
4. Verify app is reachable and login page loads.

Core command pattern (Docker):

```bash
docker compose pull
docker compose up -d
docker compose logs --tail=200 app
```

## Standard Mode

### A) Docker Path

Required decisions:

- database mode: `bundled` or `existing`
- release channel
- target directory

Steps:

1. Build or update compose file according to docs.
2. Set required environment variables (`APP_KEY`, `DB_DIALECT`, DB connection fields).
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

Example next-step text:

```text
浏览器打开 http://127.0.0.1:13000 完成首次登录。
默认账号：admin@nocobase.com
默认密码：admin123
首次登录后请立即修改默认密码。
```

## Post-Install MCP Bootstrap

Run this section when downstream work depends on MCP.

1. Build endpoint URL (`/api/mcp` for main app, `/api/__app/<app_name>/mcp` for non-main app).
2. Probe endpoint route before client config.
3. If endpoint probe is `404`, stop and ask user to activate `MCP Server` plugin manually.
4. If `mcp_auth_mode=api-key`:
- Ensure API token env var exists.
- Probe with bearer token.
- If probe is `401/403`, stop and ask user to activate `API Keys` plugin manually and regenerate token.
5. Run client connection commands from [MCP Runbook](mcp-runbook.md).
6. Record endpoint, auth mode, package scope, and verification evidence.

## Known Pitfalls

1. Port already in use.
2. Missing `DB_DIALECT`.
3. Node/Yarn version mismatch on non-Docker paths.
4. Missing internet access for dependency/plugin download.
5. MCP endpoint `404` because `MCP Server` plugin is not activated.
6. API key auth fails because `API Keys` plugin is not activated or token is stale.
