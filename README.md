# NocoBase Skills

> [!WARNING]
> This project is currently in draft status. The content is incomplete and intended for orientation only. It may change and iterate at any time.

This repository provides reusable NocoBase skills for coding agent CLIs (Codex, Claude Code, OpenCode, etc.) to automate installation, API calls, Swagger discovery, and data modeling tasks.

## Available Skills

- `nocobase-install-start`: installs and starts NocoBase (Docker / create-nocobase-app / git).
- `nocobase-mcp-setup`: configures NocoBase as an MCP server for your coding agent CLI.
- `nocobase-data-modeling`: runs data modeling operations through MCP tools.

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

1. Install NocoBase (skip if already installed).

Ask your agent:

```text
Install and start NocoBase.
```

2. Enable the `API Keys` plugin and create a token.

In NocoBase admin:

- Enable the `API Keys` plugin.
- Go to `Settings -> API keys`.
- Create a key and copy the token.

3. Configure NocoBase MCP server.

Ask your agent:

```text
Set up NocoBase MCP connection.
```

Or configure it manually:

Prerequisites:

- NocoBase is running.
- The `API Keys` plugin is enabled.
- You have created an API token in `Settings -> API keys`.

NocoBase MCP endpoint:

- URL: `https://your-nocobase-host/api/mcp`
- Header: `Authorization: Bearer your-token`

Examples:

**Codex CLI**

```bash
export NOCOBASE_API_TOKEN="your-token"
codex mcp add nocobase --url https://your-nocobase-host/api/mcp --bearer-token-env-var NOCOBASE_API_TOKEN
```

**Claude Code**

```bash
claude mcp add --transport http nocobase https://your-nocobase-host/api/mcp --header "Authorization: Bearer your-token"
```

**Other CLIs**

Use your CLI's MCP configuration mechanism with the same endpoint and bearer token header shown above.

4. Start building with data modeling.

Ask your agent:

```text
Create a collection named "products" with fields: title (text), price (number), description (textarea).
```

All NocoBase API operations are now available through MCP tools.
