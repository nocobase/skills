# NocoBase Skills

> [!WARNING]
> This project is currently in draft status. The content is incomplete and intended for orientation only. It may change and iterate at any time.

This repository provides reusable NocoBase skills for coding agent CLIs (Codex, Claude Code, OpenCode, etc.) to automate installation, API calls, Swagger discovery, and data modeling tasks.

## Available Skills

- `nocobase-install-start`: installs and starts NocoBase (Docker / create-nocobase-app / git).
- `nocobase-api-call`: executes authenticated NocoBase API requests with environment setup guidance.
- `nocobase-swagger-fetch`: fetches Swagger/OpenAPI docs by namespace via `nocobase-api-call`.
- `nocobase-data-modeling`: runs an end-to-end data modeling flow based on Swagger + API calls.

## Installation

1. Install a coding agent CLI.

Use any supported agent CLI, such as Codex, Claude Code, or OpenCode.

2. Install Skills from [skills.sh](https://skills.sh/).

Install all NocoBase skills from this repository:

```bash
mkdir nocobase-app-builder && cd nocobase-app-builder
npx skills add nocobase/skills
```

## Recommended Usage Flow

1. Install NocoBase (skip this step if it is already installed).

Ask your agent to complete installation and startup:

```bash
Install and start NocoBase.
```

2. Enable the `API Keys` plugin and create a token.

In NocoBase admin:

- Enable the `API Keys` plugin.
- Go to `Settings -> API keys`.
- Create a key and copy the token.

3. Enable the `API Docs` plugin.

Enable `API Docs` before any Swagger-related tasks.

If the Swagger API returns `404 Not Found`, the most likely cause is that `API Docs` is not enabled.

4. Configure environment variables.

```bash
export NOCOBASE_URL="http://localhost:13000"
export NOCOBASE_API_TOKEN="<your-token>"
```
