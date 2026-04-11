# MCP Client Templates

Use this file when `mcp_client` is set and you need a copy-paste-ready client config.

## Shared Rules

1. Endpoint:
- Main app: `<base_url>/api/mcp`
- Non-main app: `<base_url>/api/__app/<app_name>/mcp`

2. Streamable HTTP headers:
- `Content-Type: application/json`
- `Accept: application/json, text/event-stream`

3. API-key mode requires bearer token wiring.
4. OAuth mode should not force bearer token headers.
5. `x-mcp-packages` is optional; only add when package scope must be restricted.

## Env Placeholder Syntax by Client

| client | env placeholder style |
|---|---|
| `codex` | `--bearer-token-env-var NOCOBASE_API_TOKEN` |
| `claude` | `${NOCOBASE_API_TOKEN}` |
| `opencode` | `{env:NOCOBASE_API_TOKEN}` |
| `vscode` | `${input:nocobase_token}` or `${env:NOCOBASE_API_TOKEN}` |
| `windsurf` | `{{NOCOBASE_API_TOKEN}}` |
| `cline` | `${NOCOBASE_API_TOKEN}` |

## Codex

API key mode:

```bash
export NOCOBASE_API_TOKEN=<your_api_key>
codex mcp add nocobase --url http://127.0.0.1:13000/api/mcp --bearer-token-env-var NOCOBASE_API_TOKEN
```

OAuth mode:

```bash
codex mcp add nocobase --url http://127.0.0.1:13000/api/mcp
codex mcp login nocobase --scopes mcp,offline_access
```

## Claude Code

API key mode:

```bash
export NOCOBASE_API_TOKEN=<your_api_key>
claude mcp add-json nocobase '{
  "type":"http",
  "url":"http://127.0.0.1:13000/api/mcp",
  "headers":{
    "Authorization":"Bearer ${NOCOBASE_API_TOKEN}",
    "Accept":"application/json, text/event-stream"
  }
}'
```

OAuth mode:

```bash
claude mcp add-json nocobase '{
  "type":"http",
  "url":"http://127.0.0.1:13000/api/mcp"
}'
```

## OpenCode

`~/.config/opencode/opencode.json` snippet:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "nocobase": {
      "type": "remote",
      "url": "http://127.0.0.1:13000/api/mcp",
      "headers": {
        "Authorization": "Bearer {env:NOCOBASE_API_TOKEN}",
        "Accept": "application/json, text/event-stream"
      }
    }
  }
}
```

Per-agent enable example:

```bash
opencode mcp add nocobase --agent codex
```

## VS Code Copilot

`.vscode/mcp.json` snippet:

```json
{
  "servers": {
    "nocobase": {
      "type": "http",
      "url": "http://127.0.0.1:13000/api/mcp",
      "headers": {
        "Authorization": "Bearer ${input:nocobase_token}",
        "Accept": "application/json, text/event-stream"
      },
      "inputs": [
        {
          "type": "promptString",
          "id": "nocobase_token",
          "description": "NocoBase API token",
          "password": true
        }
      ]
    }
  }
}
```

## Windsurf

`mcp_config.json` snippet:

```json
{
  "mcpServers": {
    "nocobase": {
      "transport": {
        "type": "http",
        "url": "http://127.0.0.1:13000/api/mcp",
        "headers": {
          "Authorization": "Bearer {{NOCOBASE_API_TOKEN}}",
          "Accept": "application/json, text/event-stream"
        }
      }
    }
  }
}
```

## Cline

`cline_mcp_settings.json` snippet:

```json
{
  "mcpServers": {
    "nocobase": {
      "url": "http://127.0.0.1:13000/api/mcp",
      "headers": {
        "Authorization": "Bearer ${NOCOBASE_API_TOKEN}",
        "Accept": "application/json, text/event-stream"
      }
    }
  }
}
```

## Fast Verification

After client config, verify with one manual initialize request:

```bash
curl -i -X POST http://127.0.0.1:13000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $NOCOBASE_API_TOKEN" \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"mcp-template-check","version":"1.0.0"}}}'
```

Expected:
- HTTP status is `200`.
- No `Not Acceptable` message.
- No `Authentication required` message.
