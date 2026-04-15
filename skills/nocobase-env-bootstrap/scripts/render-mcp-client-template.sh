#!/usr/bin/env bash

set -u

CLIENT="${1:-all}"
BASE_URL="${2:-http://127.0.0.1:13000}"
MCP_AUTH_MODE="${3:-api-key}"
MCP_SCOPE="${4:-main}"
MCP_APP_NAME="${5:-}"
TOKEN_ENV="${6:-NOCOBASE_API_TOKEN}"
MCP_PACKAGES="${7:-}"
SERVER_NAME="${SERVER_NAME:-nocobase}"
OUTPUT_FILE="${OUTPUT_FILE:-}"

trim_trailing_slash() {
  local value="$1"
  while [[ "$value" == */ ]]; do
    value="${value%/}"
  done
  printf '%s' "$value"
}

resolve_mcp_url() {
  local base
  base="$(trim_trailing_slash "$BASE_URL")"
  if [[ "$MCP_SCOPE" == "non-main" ]]; then
    if [[ -z "$MCP_APP_NAME" ]]; then
      printf 'error: MCP_APP_NAME is required when MCP_SCOPE=non-main\n' >&2
      exit 1
    fi
    printf '%s/api/__app/%s/mcp' "$base" "$MCP_APP_NAME"
    return
  fi
  printf '%s/api/mcp' "$base"
}

add_packages_header_fragment() {
  if [[ -n "$MCP_PACKAGES" ]]; then
    printf ', "x-mcp-packages":"%s"' "$MCP_PACKAGES"
  fi
}

emit_codex() {
  printf '## codex\n\n'
  case "$MCP_AUTH_MODE" in
    api-key)
      printf '1. Set token env var:\n'
      printf '```bash\nexport %s=<your_api_key>\n```\n\n' "$TOKEN_ENV"
      printf '2. Add server:\n'
      printf '```bash\ncodex mcp add %s --url %s --bearer-token-env-var %s\n```\n' "$SERVER_NAME" "$TARGET_MCP_URL" "$TOKEN_ENV"
      ;;
    oauth)
      printf '```bash\ncodex mcp add %s --url %s\ncodex mcp login %s --scopes mcp,offline_access\n```\n' "$SERVER_NAME" "$TARGET_MCP_URL" "$SERVER_NAME"
      ;;
    *)
      printf '```bash\ncodex mcp add %s --url %s\n```\n' "$SERVER_NAME" "$TARGET_MCP_URL"
      ;;
  esac
  if [[ -n "$MCP_PACKAGES" ]]; then
    printf '\n> note: codex CLI command does not inject `x-mcp-packages` directly; configure package header in MCP server config file if strict package scoping is required.\n'
  fi
  printf '\n'
}

emit_claude() {
  local headers
  headers='"Accept":"application/json, text/event-stream"'
  if [[ "$MCP_AUTH_MODE" == "api-key" ]]; then
    headers='"Authorization":"Bearer ${'"$TOKEN_ENV"'}", '"$headers"
  fi
  if [[ -n "$MCP_PACKAGES" ]]; then
    headers="$headers, \"x-mcp-packages\":\"$MCP_PACKAGES\""
  fi

  printf '## claude\n\n'
  printf '```bash\n'
  printf "claude mcp add-json %s '{\"type\":\"http\",\"url\":\"%s\",\"headers\":{%s}}'\n" "$SERVER_NAME" "$TARGET_MCP_URL" "$headers"
  printf '```\n\n'
}

emit_opencode() {
  local auth_line=''
  local packages_line=''
  if [[ "$MCP_AUTH_MODE" == "api-key" ]]; then
    auth_line='        "Authorization": "Bearer {env:'"$TOKEN_ENV"'}",'
  fi
  if [[ -n "$MCP_PACKAGES" ]]; then
    packages_line='        "x-mcp-packages": "'"$MCP_PACKAGES"'"'
  fi

  printf '## opencode\n\n'
  printf 'Save snippet to `~/.config/opencode/opencode.json`:\n'
  printf '```json\n'
  printf '{\n'
  printf '  "$schema": "https://opencode.ai/config.json",\n'
  printf '  "mcp": {\n'
  printf '    "%s": {\n' "$SERVER_NAME"
  printf '      "type": "remote",\n'
  printf '      "url": "%s",\n' "$TARGET_MCP_URL"
  printf '      "headers": {\n'
  if [[ -n "$auth_line" ]]; then
    printf '%s\n' "$auth_line"
  fi
  if [[ -n "$packages_line" ]]; then
    printf '        "Accept": "application/json, text/event-stream",\n'
    printf '%s\n' "$packages_line"
  else
    printf '        "Accept": "application/json, text/event-stream"\n'
  fi
  printf '      }\n'
  printf '    }\n'
  printf '  }\n'
  printf '}\n'
  printf '```\n\n'
  printf 'Optional per-agent binding:\n'
  printf '```bash\nopencode mcp add %s --agent codex\n```\n\n' "$SERVER_NAME"
}

emit_vscode() {
  local auth_line=''
  local inputs_block=''
  local packages_line=''
  if [[ "$MCP_AUTH_MODE" == "api-key" ]]; then
    auth_line='          "Authorization": "Bearer ${input:nocobase_token}",'
    inputs_block=$'      "inputs": [\n        {\n          "type": "promptString",\n          "id": "nocobase_token",\n          "description": "NocoBase API token",\n          "password": true\n        }\n      ]'
  fi
  if [[ -n "$MCP_PACKAGES" ]]; then
    packages_line='          "x-mcp-packages": "'"$MCP_PACKAGES"'"'
  fi

  printf '## vscode\n\n'
  printf 'Save snippet to `.vscode/mcp.json`:\n'
  printf '```json\n'
  printf '{\n'
  printf '  "servers": {\n'
  printf '    "%s": {\n' "$SERVER_NAME"
  printf '      "type": "http",\n'
  printf '      "url": "%s",\n' "$TARGET_MCP_URL"
  printf '      "headers": {\n'
  if [[ -n "$auth_line" ]]; then
    printf '%s\n' "$auth_line"
  fi
  if [[ -n "$packages_line" ]]; then
    printf '          "Accept": "application/json, text/event-stream",\n'
    printf '%s\n' "$packages_line"
  else
    printf '          "Accept": "application/json, text/event-stream"\n'
  fi
  printf '      }'
  if [[ -n "$inputs_block" ]]; then
    printf ',\n%s\n' "$inputs_block"
  else
    printf '\n'
  fi
  printf '    }\n'
  printf '  }\n'
  printf '}\n'
  printf '```\n\n'
}

emit_windsurf() {
  local auth_line=''
  local packages_line=''
  if [[ "$MCP_AUTH_MODE" == "api-key" ]]; then
    auth_line='            "Authorization": "Bearer {{'"$TOKEN_ENV"'}}",'
  fi
  if [[ -n "$MCP_PACKAGES" ]]; then
    packages_line='            "x-mcp-packages": "'"$MCP_PACKAGES"'"'
  fi

  printf '## windsurf\n\n'
  printf 'Save snippet to `mcp_config.json`:\n'
  printf '```json\n'
  printf '{\n'
  printf '  "mcpServers": {\n'
  printf '    "%s": {\n' "$SERVER_NAME"
  printf '      "transport": {\n'
  printf '        "type": "http",\n'
  printf '        "url": "%s",\n' "$TARGET_MCP_URL"
  printf '        "headers": {\n'
  if [[ -n "$auth_line" ]]; then
    printf '%s\n' "$auth_line"
  fi
  if [[ -n "$packages_line" ]]; then
    printf '            "Accept": "application/json, text/event-stream",\n'
    printf '%s\n' "$packages_line"
  else
    printf '            "Accept": "application/json, text/event-stream"\n'
  fi
  printf '        }\n'
  printf '      }\n'
  printf '    }\n'
  printf '  }\n'
  printf '}\n'
  printf '```\n\n'
}

emit_cline() {
  local auth_line=''
  local packages_line=''
  if [[ "$MCP_AUTH_MODE" == "api-key" ]]; then
    auth_line='        "Authorization": "Bearer ${'"$TOKEN_ENV"'}",'
  fi
  if [[ -n "$MCP_PACKAGES" ]]; then
    packages_line='        "x-mcp-packages": "'"$MCP_PACKAGES"'"'
  fi

  printf '## cline\n\n'
  printf 'Save snippet to `cline_mcp_settings.json`:\n'
  printf '```json\n'
  printf '{\n'
  printf '  "mcpServers": {\n'
  printf '    "%s": {\n' "$SERVER_NAME"
  printf '      "url": "%s",\n' "$TARGET_MCP_URL"
  printf '      "headers": {\n'
  if [[ -n "$auth_line" ]]; then
    printf '%s\n' "$auth_line"
  fi
  if [[ -n "$packages_line" ]]; then
    printf '        "Accept": "application/json, text/event-stream",\n'
    printf '%s\n' "$packages_line"
  else
    printf '        "Accept": "application/json, text/event-stream"\n'
  fi
  printf '      }\n'
  printf '    }\n'
  printf '  }\n'
  printf '}\n'
  printf '```\n\n'
}

emit_for_client() {
  case "$1" in
    codex) emit_codex ;;
    claude) emit_claude ;;
    opencode) emit_opencode ;;
    vscode) emit_vscode ;;
    windsurf) emit_windsurf ;;
    cline) emit_cline ;;
    *)
      printf 'error: unsupported client: %s\n' "$1" >&2
      exit 1
      ;;
  esac
}

TARGET_MCP_URL="$(resolve_mcp_url)"

if [[ -n "$OUTPUT_FILE" ]]; then
  exec >"$OUTPUT_FILE"
fi

printf '# MCP Client Template Output\n\n'
printf -- '- endpoint: %s\n' "$TARGET_MCP_URL"
printf -- '- auth_mode: %s\n' "$MCP_AUTH_MODE"
printf -- '- token_env: %s\n' "$TOKEN_ENV"
if [[ -n "$MCP_PACKAGES" ]]; then
  printf -- '- mcp_packages: %s\n' "$MCP_PACKAGES"
fi
printf '\n'

if [[ "$CLIENT" == "all" ]]; then
  emit_for_client codex
  emit_for_client claude
  emit_for_client opencode
  emit_for_client vscode
  emit_for_client windsurf
  emit_for_client cline
else
  emit_for_client "$CLIENT"
fi
