# NocoBase Skills

> [!WARNING]
> NocoBase Skills is still in draft status. The content is for reference and may change at any time.

This repository provides reusable NocoBase skills for coding agent CLIs such as Codex, Claude Code, and OpenCode. It helps agents complete installation, MCP connection, data modeling, and workflow configuration tasks more efficiently.

## Available Skills

- `nocobase-install-start`: installs and starts NocoBase (Docker / create-nocobase-app / git).
- `nocobase-mcp-setup`: configures NocoBase as an MCP server for your coding agent CLI.
- `nocobase-data-modeling`: runs data modeling operations through `nb api data-modeling` first, with MCP as fallback.
- `nocobase-workflow-manage`: creates and manages NocoBase workflows through MCP tools.
- `nocobase-ui-builder`: **default** entry point for any NocoBase UI authoring — new pages, new blocks, menu items, and localized edits. Works directly against the live app via MCP / `nocobase-ctl flow-surfaces`, no DSL file commit needed.
- `nocobase-dsl-reconciler`: **opt-in** YAML-DSL path for building whole NocoBase applications from spec files committed to git and deployed via `cli push`. Use **only** when the user explicitly asks for DSL / YAML / committable spec files — this reconciler is still under active development and has rough edges the live-UI path avoids.

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

3. Build your application.

**Default path: live UI authoring via `nocobase-ui-builder`**

For any NocoBase UI request — build a new page, add blocks, adjust an
existing screen, set up linkage rules — ask the agent in plain
business language. The skill routes through the MCP / `flow-surfaces`
transport directly against the running app:

```text
I'm building a CRM — create a Contacts page with a filter, a table, and an Add New popup.
```

```text
Add a Sales Dashboard tab with 4 KPI cards and 2 charts.
```

```text
On the leads table, the owner column should open the user's profile popup.
```

Incremental tweaks work the same way — just describe what you want.

**Opt-in path: DSL specs via `nocobase-dsl-reconciler`**

Use this only when you explicitly want YAML spec files committed to
git (for CI/CD, version-controlled deployments, or replicating an app
across environments). You must name the DSL path in your request:

```text
Use the DSL reconciler to build a project management system — I want YAML specs I can commit.
```

The reconciler is still under active development; prefer the default
live-UI path unless the spec-file workflow is a hard requirement.
