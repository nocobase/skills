---
name: nocobase-mcp-setup
description: Configure NocoBase as an MCP server for your coding agent CLI. Use when users need to set up MCP connection to NocoBase for the first time.
allowed-tools: Bash, Read
---

# Goal

Configure the NocoBase MCP connection for the user's coding agent CLI and verify that the server is reachable and authenticated.

# Workflow

1. Confirm which app endpoint should be used:
   - Main app: `http(s)://<host>:<port>/api/mcp`
   - Non-main app: `http(s)://<host>:<port>/api/__app/<app_name>/mcp`
2. Verify NocoBase is running and accessible.
3. Determine the auth mode:
   - API Key: require the `API Keys` plugin and an existing API key
   - OAuth: require the `IdP: OAuth` plugin
4. Guide the user to add the NocoBase MCP server using the command for their CLI.
5. Verify the MCP connection by checking the registered server and available tools.

# Service Notes

- NocoBase MCP uses the `streamable HTTP` transport protocol.
- NocoBase exposes:
  - NocoBase core and plugin APIs
  - A generic CRUD tool for operating on collections

# MCP Configuration

Choose commands based on the user's CLI and auth mode.

**Codex with API Key**
```bash
export NOCOBASE_API_TOKEN=<your_api_key>
codex mcp add nocobase --url http://<host>:<port>/api/mcp --bearer-token-env-var NOCOBASE_API_TOKEN
```

**Codex with OAuth**
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

Use the same endpoint pattern and auth mode supported by the CLI.

# Prerequisites

- NocoBase is installed and running
- The correct app endpoint is known
- For API Key auth:
  - `API Keys` plugin is enabled
  - an API key has been created
- For OAuth auth:
  - `IdP: OAuth` plugin is enabled

# Verification

After configuration, verify that NocoBase MCP tools are available for NocoBase API operations such as collections and fields.

For Codex CLI, use:
```bash
codex mcp list
codex mcp get nocobase
```

For Claude Code, start Claude and inspect the MCP entry:

```bash
claude
/mcp
```
