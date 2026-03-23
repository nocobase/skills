# NocoBase Skills

> [!WARNING]
> NocoBase Skills is still in draft status. The content is for reference and may change at any time.

This repository provides reusable NocoBase skills for coding agent CLIs such as Codex, Claude Code, and OpenCode. It helps agents complete installation, MCP connection, data modeling, and workflow configuration tasks more efficiently.

## Available Skills

- `nocobase-install-start`: installs and starts NocoBase (Docker / create-nocobase-app / git).
- `nocobase-mcp-setup`: configures NocoBase as an MCP server for your coding agent CLI.
- `nocobase-data-modeling`: runs data modeling operations through MCP tools.
- `nocobase-workflow-manage`: creates and manages NocoBase workflows through MCP tools.
- `nocobase-ui-builder`: builds and updates Modern page (v2) UI structures through MCP tools.

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

2. Configure NocoBase MCP Server.

Ask your agent:

```text
Set up NocoBase MCP connection.
```

Or configure it manually:

NocoBase MCP endpoint:

- Main app: `http(s)://<host>:<port>/api/mcp`
- Non-main app: `http(s)://<host>:<port>/api/__app/<app_name>/mcp`

The endpoint uses the `streamable HTTP` transport protocol.

MCP capabilities exposed by NocoBase:

- NocoBase core and plugin APIs
- A generic CRUD tool for operating on collections

Authentication options:

- API Key: enable the `API Keys` plugin, then create a key in `Settings -> API keys`
- OAuth: enable the `IdP: OAuth` plugin

Examples:

**Codex CLI with API Key**

```bash
export NOCOBASE_API_TOKEN=<your_api_key>
codex mcp add nocobase --url http://<host>:<port>/api/mcp --bearer-token-env-var NOCOBASE_API_TOKEN
```

**Codex CLI with OAuth**

```bash
codex mcp add nocobase --url http://<host>:<port>/api/mcp
codex mcp login nocobase --scopes mcp,offline_access
```

**Claude Code with API Key**

```bash
claude mcp add --transport http nocobase http://<host>:<port>/api/mcp --header "Authorization: Bearer <your_api_key>"
```

**Claude Code with OAuth**

```bash
claude mcp add --transport http nocobase http://<host>:<port>/api/mcp
```

Then open Claude and complete login from the MCP panel:

```bash
claude
/mcp
```

**Other CLIs**

Use your CLI's MCP configuration mechanism with the same NocoBase MCP endpoint and auth mode.

3. Start building with data modeling and business setup.

Ask your agent:

```text
I am building a CRM, design and create collections.
```

After the MCP connection is ready, most NocoBase APIs can be called through MCP tools.
