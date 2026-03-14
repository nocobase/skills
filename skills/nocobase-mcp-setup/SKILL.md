---
name: nocobase-mcp-setup
description: Configure NocoBase as an MCP server for your coding agent CLI. Use when users need to set up MCP connection to NocoBase for the first time.
allowed-tools: Bash, Read
---

# Goal

Configure NocoBase as an MCP (Model Context Protocol) server to enable direct API access through native tools.

# Workflow

1. Verify NocoBase is running and accessible.
2. Confirm user has created an API token:
   - In NocoBase admin, enable `API Keys` plugin.
   - Go to `Settings -> API keys` and create a token.
3. Guide user to add NocoBase MCP server using their CLI's command.
4. Verify MCP connection by checking available tools.

# MCP Configuration

The configuration command varies by CLI tool:

**Codex CLI:**
```bash
export NOCOBASE_API_TOKEN="your-token"
codex mcp add nocobase --url https://your-nocobase-host/api/mcp --bearer-token-env-var NOCOBASE_API_TOKEN
```

**Claude Code:**
```bash
claude mcp add --transport http nocobase https://your-nocobase-host/api/mcp --header "Authorization: Bearer your-token"
```

**Other CLIs:**
Refer to your CLI's documentation for MCP server configuration. The NocoBase MCP endpoint is:
- URL: `https://your-nocobase-host/api/mcp`
- Header: `Authorization: Bearer your-token`

Replace `your-token` with the actual API token from NocoBase admin.

# Prerequisites

- NocoBase is installed and running
- API Keys plugin is enabled
- API token has been created

# Verification

After configuration, verify that NocoBase MCP tools are available by checking for tools related to NocoBase API operations (collections, fields, etc.).

For Codex CLI, use:
```bash
codex mcp list
codex mcp get nocobase
```
