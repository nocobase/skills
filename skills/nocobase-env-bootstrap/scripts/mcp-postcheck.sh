#!/usr/bin/env bash

set -u

DEFAULT_PORT="${1:-13000}"
MCP_AUTH_MODE="${MCP_AUTH_MODE:-none}"
MCP_URL="${MCP_URL:-}"
MCP_APP_NAME="${MCP_APP_NAME:-}"
MCP_TOKEN_ENV="${MCP_TOKEN_ENV:-NOCOBASE_API_TOKEN}"
MCP_PACKAGES="${MCP_PACKAGES:-}"
MCP_AUTO_API_KEY="${MCP_AUTO_API_KEY:-1}"
MCP_AUTO_API_KEY_NAME="${MCP_AUTO_API_KEY_NAME:-mcp_auto_token}"
MCP_AUTO_API_KEY_USERNAME="${MCP_AUTO_API_KEY_USERNAME:-nocobase}"
MCP_AUTO_API_KEY_ROLE="${MCP_AUTO_API_KEY_ROLE:-root}"
MCP_AUTO_API_KEY_EXPIRES_IN="${MCP_AUTO_API_KEY_EXPIRES_IN:-30d}"
MCP_AUTO_API_KEY_APP_SERVICE="${MCP_AUTO_API_KEY_APP_SERVICE:-app}"
MCP_AUTO_API_KEY_COMPOSE_FILE="${MCP_AUTO_API_KEY_COMPOSE_FILE:-}"
FAIL=0
WARN=0
PASS=0
MCP_SESSION_ID=""
MCP_LAST_STATUS=""
MCP_LAST_BODY=""
MCP_LAST_HEADERS=""
MCP_AUTH_READY=0
MCP_PROTOCOL_TOKEN=""

record() {
  local level="$1"
  local id="$2"
  local message="$3"
  local fix="${4:-}"
  printf '[%s] %s: %s\n' "$level" "$id" "$message"
  if [[ -n "$fix" ]]; then
    printf '  fix: %s\n' "$fix"
  fi
  case "$level" in
    pass) PASS=$((PASS + 1)) ;;
    warn) WARN=$((WARN + 1)) ;;
    fail) FAIL=$((FAIL + 1)) ;;
  esac
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

resolve_mcp_url() {
  if [[ -n "$MCP_URL" ]]; then
    printf '%s' "$MCP_URL"
    return
  fi

  if [[ -n "$MCP_APP_NAME" ]]; then
    printf 'http://127.0.0.1:%s/api/__app/%s/mcp' "$DEFAULT_PORT" "$MCP_APP_NAME"
    return
  fi

  printf 'http://127.0.0.1:%s/api/mcp' "$DEFAULT_PORT"
}

activation_plugins_csv() {
  local plugins="@nocobase/plugin-mcp-server"
  case "$MCP_AUTH_MODE" in
    api-key) plugins="${plugins},@nocobase/plugin-api-keys" ;;
    oauth) plugins="${plugins},@nocobase/plugin-idp-oauth" ;;
  esac
  printf '%s' "$plugins"
}

plugin_step_id() {
  case "$1" in
    @nocobase/plugin-mcp-server) printf 'plugin_manage_enable_mcp_server' ;;
    @nocobase/plugin-api-keys) printf 'plugin_manage_enable_api_keys' ;;
    @nocobase/plugin-idp-oauth) printf 'plugin_manage_enable_idp_oauth' ;;
    *) printf 'plugin_manage_enable_plugin' ;;
  esac
}

plugin_enable_hint() {
  local plugins_csv="$1"
  local plugin_args
  plugin_args="$(printf '%s' "$plugins_csv" | tr ',' ' ')"
  printf 'Run fixed sequence: Use $nocobase-plugin-manage enable %s -> restart app -> rerun postcheck. Enable bundle: %s. Do not bypass plugin-manage with ad-hoc container shell plugin commands; plugin-manage may auto-select docker CLI internally.' "$plugin_args" "$plugins_csv"
}

emit_activate_plugin_action() {
  local plugins_csv="$1"
  printf 'action_required: activate_plugin\n'
  local old_ifs="$IFS"
  IFS=','
  for plugin in $plugins_csv; do
    printf 'required_step: %s\n' "$(plugin_step_id "$plugin")"
  done
  IFS="$old_ifs"
  printf 'required_step: restart_app\n'
  printf 'required_step: rerun_mcp_postcheck\n'
}

resolve_compose_file() {
  if [[ -n "$MCP_AUTO_API_KEY_COMPOSE_FILE" ]]; then
    if [[ -f "$MCP_AUTO_API_KEY_COMPOSE_FILE" ]]; then
      printf '%s' "$MCP_AUTO_API_KEY_COMPOSE_FILE"
      return
    fi
    printf ''
    return
  fi

  local candidate
  for candidate in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
    if [[ -f "$candidate" ]]; then
      printf '%s' "$candidate"
      return
    fi
  done
  printf ''
}

extract_api_key_token() {
  local text="$1"
  local token

  token="$(printf '%s\n' "$text" | awk '/-----BEGIN API KEY-----/{flag=1;next}/-----END API KEY-----/{flag=0}flag' | tr -d '\r' | tail -n 1 | tr -d '[:space:]')"
  if [[ -n "$token" ]]; then
    printf '%s' "$token"
    return
  fi

  token="$(printf '%s' "$text" | grep -oE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' | head -n 1)"
  printf '%s' "$token"
}

token_preview() {
  local token="$1"
  local len="${#token}"
  if [[ "$len" -le 12 ]]; then
    printf '%*s' "$len" '' | tr ' ' '*'
    return
  fi
  printf '%s...%s' "${token:0:6}" "${token: -4}"
}

auto_generate_api_key() {
  AUTO_TOKEN_VALUE=""
  AUTO_TOKEN_SOURCE=""
  AUTO_TOKEN_ERROR="Auto API key generation failed from local CLI and docker compose paths."

  local output token compose_file

  if has_cmd yarn; then
    output="$(yarn nocobase generate-api-key -n "$MCP_AUTO_API_KEY_NAME" -r "$MCP_AUTO_API_KEY_ROLE" -u "$MCP_AUTO_API_KEY_USERNAME" -e "$MCP_AUTO_API_KEY_EXPIRES_IN" --silent 2>&1 || true)"
    token="$(extract_api_key_token "$output")"
    if [[ -n "$token" ]]; then
      AUTO_TOKEN_VALUE="$token"
      AUTO_TOKEN_SOURCE="local-cli"
      return 0
    fi
  fi

  if has_cmd docker; then
    compose_file="$(resolve_compose_file)"
    local -a cmd
    cmd=(docker compose)
    if [[ -n "$compose_file" ]]; then
      cmd+=(-f "$compose_file")
    fi
    cmd+=(exec -T "$MCP_AUTO_API_KEY_APP_SERVICE" yarn nocobase generate-api-key -n "$MCP_AUTO_API_KEY_NAME" -r "$MCP_AUTO_API_KEY_ROLE" -u "$MCP_AUTO_API_KEY_USERNAME" -e "$MCP_AUTO_API_KEY_EXPIRES_IN" --silent)

    output="$("${cmd[@]}" 2>&1 || true)"
    token="$(extract_api_key_token "$output")"
    if [[ -n "$token" ]]; then
      AUTO_TOKEN_VALUE="$token"
      AUTO_TOKEN_SOURCE="docker-compose-exec"
      return 0
    fi
  fi

  return 1
}

http_status() {
  local url="$1"
  local token="${2:-}"

  if ! has_cmd curl; then
    printf ''
    return
  fi

  local status
  if [[ -n "$token" ]]; then
    status="$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" -H 'Accept: application/json, text/event-stream' --connect-timeout 8 --max-time 10 "$url" || true)"
  else
    status="$(curl -sS -o /dev/null -w '%{http_code}' -H 'Accept: application/json, text/event-stream' --connect-timeout 8 --max-time 10 "$url" || true)"
  fi

  if [[ "$status" == "000" ]]; then
    printf ''
  else
    printf '%s' "$status"
  fi
}

post_mcp() {
  local payload="$1"
  local token="${2:-}"
  local session_id="${3:-}"

  if ! has_cmd curl; then
    MCP_LAST_STATUS=""
    MCP_LAST_BODY=""
    MCP_LAST_HEADERS=""
    return 1
  fi

  local header_file body_file
  header_file="$(mktemp)"
  body_file="$(mktemp)"

  local -a curl_args
  curl_args=(
    -sS
    -D "$header_file"
    -o "$body_file"
    -w '%{http_code}'
    --connect-timeout 8
    --max-time 15
    -H 'Content-Type: application/json'
    -H 'Accept: application/json, text/event-stream'
  )

  if [[ -n "$token" ]]; then
    curl_args+=(-H "Authorization: Bearer $token")
  fi
  if [[ -n "$session_id" ]]; then
    curl_args+=(-H "Mcp-Session-Id: $session_id")
  fi
  if [[ -n "$MCP_PACKAGES" ]]; then
    curl_args+=(-H "x-mcp-packages: $MCP_PACKAGES")
  fi

  MCP_LAST_STATUS="$(curl "${curl_args[@]}" -X POST "$TARGET_MCP_URL" --data "$payload" || true)"
  MCP_LAST_BODY="$(cat "$body_file" 2>/dev/null || true)"
  MCP_LAST_HEADERS="$(cat "$header_file" 2>/dev/null || true)"

  local sid
  sid="$(awk 'BEGIN{IGNORECASE=1} /^mcp-session-id:/ {sub(/\r$/,""); sub(/^[^:]*:[[:space:]]*/,""); print; exit}' "$header_file" 2>/dev/null || true)"
  if [[ -n "$sid" ]]; then
    MCP_SESSION_ID="$sid"
  fi

  rm -f "$header_file" "$body_file"

  if [[ -z "$MCP_LAST_STATUS" || "$MCP_LAST_STATUS" == "000" ]]; then
    return 1
  fi
  return 0
}

extract_json_payload() {
  local body="$1"
  if printf '%s\n' "$body" | grep -Eq '^[[:space:]]*data:'; then
    printf '%s\n' "$body" | sed -n 's/^[[:space:]]*data:[[:space:]]*//p' | tail -n 1
    return
  fi
  printf '%s' "$body"
}

mcp_has_error() {
  local json="$1"
  printf '%s' "$json" | grep -Eq '"error"[[:space:]]*:'
}

extract_tool_names() {
  local json="$1"
  printf '%s' "$json" |
    grep -oE '"name"[[:space:]]*:[[:space:]]*"[^"]+"' |
    sed -E 's/.*"([^"]+)"$/\1/' |
    awk '!seen[$0]++'
}

select_probe_tool() {
  local tool_names="$1"
  local preferred
  for preferred in available_actions_list roles_list data_sources_list; do
    if printf '%s\n' "$tool_names" | grep -Fxq "$preferred"; then
      printf '%s' "$preferred"
      return
    fi
  done
  printf '%s\n' "$tool_names" | grep -E '_list$' | head -n 1
}

APP_BASE_URL="http://127.0.0.1:${DEFAULT_PORT}"
PLUGIN_MANAGER_URL="${APP_BASE_URL}/admin/settings/plugin-manager"
API_KEYS_CONFIG_URL="${APP_BASE_URL}/admin/settings/api-keys"
TARGET_MCP_URL="$(resolve_mcp_url)"
ACTIVATION_PLUGINS_CSV="$(activation_plugins_csv)"
PLUGIN_ENABLE_HINT="$(plugin_enable_hint "$ACTIVATION_PLUGINS_CSV")"
APP_RESTART_HINT="App may still be reloading. Restart app, wait for startup complete, then rerun postcheck."
API_KEY_CREATE_HINT="Auto token refresh failed. Fallback manual only: open ${API_KEYS_CONFIG_URL}, click Add API Key, copy token, set ${MCP_TOKEN_ENV}, then rerun postcheck."
API_KEY_AUTO_HINT="Auto token generation uses CLI: generate-api-key -n ${MCP_AUTO_API_KEY_NAME} -u ${MCP_AUTO_API_KEY_USERNAME} -r ${MCP_AUTO_API_KEY_ROLE} -e ${MCP_AUTO_API_KEY_EXPIRES_IN}."

printf 'phase: mcp-postcheck\n'
printf 'timestamp: %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
printf 'mcp_target: %s\n' "$TARGET_MCP_URL"
printf 'mcp_auth_mode: %s\n' "$MCP_AUTH_MODE"
printf 'mcp_activation_plugins: %s\n' "$ACTIVATION_PLUGINS_CSV"
printf 'mcp_auto_api_key: %s\n' "$([[ "$MCP_AUTO_API_KEY" == "1" ]] && printf enabled || printf disabled)"
printf 'mcp_manual_plugin_manager_url: %s\n' "$PLUGIN_MANAGER_URL"
printf 'mcp_manual_api_keys_url: %s\n' "$API_KEYS_CONFIG_URL"

if [[ -n "$MCP_PACKAGES" ]]; then
  record pass MCP-PKG-POST-001 "x-mcp-packages configured ($MCP_PACKAGES)."
else
  record warn MCP-PKG-POST-001 "x-mcp-packages not set; server default exposure will be used."
fi

ROUTE_STATUS="$(http_status "$TARGET_MCP_URL")"
ROUTE_BLOCKED=0
if [[ -z "$ROUTE_STATUS" ]]; then
  record fail MCP-ENDPOINT-POST-001 "MCP endpoint is unreachable ($TARGET_MCP_URL)." "Ensure app is running and routing is reachable, then retry postcheck."
  ROUTE_BLOCKED=1
elif [[ "$ROUTE_STATUS" == "404" ]]; then
  record fail MCP-ENDPOINT-POST-001 "MCP endpoint returned 404 ($TARGET_MCP_URL)." "$PLUGIN_ENABLE_HINT"
  emit_activate_plugin_action "$ACTIVATION_PLUGINS_CSV"
  ROUTE_BLOCKED=1
elif [[ "$ROUTE_STATUS" == "503" || "$ROUTE_STATUS" == 5* ]]; then
  record fail MCP-ENDPOINT-POST-001 "MCP endpoint responded with $ROUTE_STATUS ($TARGET_MCP_URL)." "$APP_RESTART_HINT"
  printf 'action_required: restart_app\n'
  printf 'required_step: restart_app\n'
  printf 'required_step: rerun_mcp_postcheck\n'
  ROUTE_BLOCKED=1
else
  record pass MCP-ENDPOINT-POST-001 "MCP endpoint responded with status $ROUTE_STATUS."
fi

if [[ "$MCP_AUTH_MODE" == "api-key" ]]; then
  if [[ "$ROUTE_BLOCKED" == "1" ]]; then
    record warn MCP-AUTH-POST-APIKEY-000 "Skip token gate because MCP endpoint is not ready yet." "Resolve endpoint blocker first, then rerun postcheck."
  else
    TOKEN_VALUE="${!MCP_TOKEN_ENV:-}"
    if [[ -z "$TOKEN_VALUE" && "$MCP_AUTO_API_KEY" == "1" ]]; then
      record warn MCP-AUTH-POST-APIKEY-001 "API key token env '$MCP_TOKEN_ENV' is missing. Trying automatic token generation." "$API_KEY_AUTO_HINT"
      if auto_generate_api_key; then
        TOKEN_VALUE="$AUTO_TOKEN_VALUE"
        export "$MCP_TOKEN_ENV=$TOKEN_VALUE"
        record pass MCP-AUTH-POST-APIKEY-001 "Automatically generated API token from $AUTO_TOKEN_SOURCE and loaded into '$MCP_TOKEN_ENV' ($(token_preview "$TOKEN_VALUE"))."
      else
        record fail MCP-AUTH-POST-APIKEY-001 "Automatic API token generation failed for '$MCP_TOKEN_ENV'." "$API_KEY_CREATE_HINT"
        printf 'action_required: provide_api_token\n'
        printf 'required_step: auto_generate_api_token_failed\n'
        printf 'required_step: manual_user_create_token\n'
        printf 'required_step: manual_user_send_token_in_chat\n'
      fi
    elif [[ -z "$TOKEN_VALUE" ]]; then
      record fail MCP-AUTH-POST-APIKEY-001 "API key token env '$MCP_TOKEN_ENV' is missing and auto generation is disabled." "$API_KEY_CREATE_HINT"
      printf 'action_required: provide_api_token\n'
      printf 'required_step: manual_user_create_token\n'
      printf 'required_step: manual_user_send_token_in_chat\n'
    else
      record pass MCP-AUTH-POST-APIKEY-001 "API key token env '$MCP_TOKEN_ENV' is present."
    fi

    if [[ -n "$TOKEN_VALUE" ]]; then
      record pass MCP-AUTH-POST-APIKEY-002 "Token validity will be verified by MCP protocol probe (initialize/tools/list/tools/call)."
      MCP_AUTH_READY=1
      MCP_PROTOCOL_TOKEN="$TOKEN_VALUE"
    fi
  fi
elif [[ "$MCP_AUTH_MODE" == "oauth" ]]; then
  record warn MCP-AUTH-POST-OAUTH-001 "OAuth postcheck requires interactive client login." "Run client login with scopes mcp,offline_access."
else
  record warn MCP-AUTH-POST-000 "MCP auth probe disabled (mode=none)." "Use api-key or oauth when MCP access is required."
fi

if [[ "$MCP_AUTH_READY" == "1" ]]; then
  INIT_PAYLOAD='{"jsonrpc":"2.0","id":9001,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"nocobase-env-bootstrap-postcheck","version":"1.2.0"}}}'
  if ! post_mcp "$INIT_PAYLOAD" "$MCP_PROTOCOL_TOKEN" "$MCP_SESSION_ID"; then
    record fail MCP-PROTO-001 "Initialize transport failed." "Verify headers include Accept: application/json, text/event-stream, then retry."
  else
    if [[ ! "$MCP_LAST_STATUS" =~ ^2 ]] && [[ "$MCP_LAST_STATUS" == "401" || "$MCP_LAST_STATUS" == "403" ]] && [[ "$MCP_AUTO_API_KEY" == "1" ]]; then
      record warn MCP-AUTH-POST-APIKEY-003 "Initialize returned HTTP $MCP_LAST_STATUS; token may be expired. Trying automatic refresh." "$API_KEY_AUTO_HINT"
      if auto_generate_api_key; then
        MCP_PROTOCOL_TOKEN="$AUTO_TOKEN_VALUE"
        export "$MCP_TOKEN_ENV=$MCP_PROTOCOL_TOKEN"
        record pass MCP-AUTH-POST-APIKEY-003 "Automatic token refresh succeeded from $AUTO_TOKEN_SOURCE ($(token_preview "$MCP_PROTOCOL_TOKEN")). Retrying initialize."
        post_mcp "$INIT_PAYLOAD" "$MCP_PROTOCOL_TOKEN" "$MCP_SESSION_ID" || true
      else
        record fail MCP-AUTH-POST-APIKEY-003 "Automatic token refresh failed after initialize auth error." "$API_KEY_CREATE_HINT"
      fi
    fi

    if [[ ! "$MCP_LAST_STATUS" =~ ^2 ]]; then
      if [[ "$MCP_LAST_STATUS" == "401" || "$MCP_LAST_STATUS" == "403" ]]; then
        record fail MCP-PROTO-001 "Initialize returned HTTP $MCP_LAST_STATUS." "$API_KEY_CREATE_HINT"
        printf 'action_required: provide_api_token\n'
        printf 'required_step: auto_generate_api_token_failed\n'
        printf 'required_step: manual_user_create_token\n'
        printf 'required_step: manual_user_send_token_in_chat\n'
      else
        record fail MCP-PROTO-001 "Initialize returned HTTP $MCP_LAST_STATUS." "Verify auth and streamable HTTP headers."
      fi
    else
    INIT_JSON="$(extract_json_payload "$MCP_LAST_BODY")"
    if mcp_has_error "$INIT_JSON"; then
      record fail MCP-PROTO-001 "Initialize returned JSON-RPC error." "Use standard initialize payload and retry."
    else
      if [[ -n "$MCP_SESSION_ID" ]]; then
        printf 'mcp_session_id: %s\n' "$MCP_SESSION_ID"
      fi
      record pass MCP-PROTO-001 "Initialize probe succeeded."

      TOOLS_PAYLOAD='{"jsonrpc":"2.0","id":9002,"method":"tools/list","params":{}}'
      if ! post_mcp "$TOOLS_PAYLOAD" "$MCP_PROTOCOL_TOKEN" "$MCP_SESSION_ID"; then
        record fail MCP-PROTO-002 "tools/list transport failed." "Retry with initialize + session header and valid auth."
      elif [[ ! "$MCP_LAST_STATUS" =~ ^2 ]]; then
        record fail MCP-PROTO-002 "tools/list returned HTTP $MCP_LAST_STATUS." "Verify auth/session state and retry."
      else
        TOOLS_JSON="$(extract_json_payload "$MCP_LAST_BODY")"
        if mcp_has_error "$TOOLS_JSON"; then
          record fail MCP-PROTO-002 "tools/list returned JSON-RPC error." "Use initialize first, then tools/list with same auth/session context."
        else
          TOOL_NAMES="$(extract_tool_names "$TOOLS_JSON")"
          if [[ -z "$TOOL_NAMES" ]]; then
            record fail MCP-PROTO-002 "tools/list succeeded but returned no tools." "Verify package scope and plugin activation."
          else
            TOOL_SAMPLE="$(printf '%s\n' "$TOOL_NAMES" | head -n 8 | paste -sd ', ' -)"
            printf 'mcp_tools_sample: %s\n' "$TOOL_SAMPLE"
            TOOL_COUNT="$(printf '%s\n' "$TOOL_NAMES" | grep -c '.')"
            record pass MCP-PROTO-002 "tools/list probe succeeded (${TOOL_COUNT} tools)."

            PROBE_TOOL="$(select_probe_tool "$TOOL_NAMES")"
            if [[ -z "$PROBE_TOOL" ]]; then
              record warn MCP-PROTO-003 "No safe list-style probe tool found for tools/call verification." "Choose a read-only tool from tools/list and verify manually."
            else
              TOOLS_CALL_PAYLOAD="{\"jsonrpc\":\"2.0\",\"id\":9003,\"method\":\"tools/call\",\"params\":{\"name\":\"${PROBE_TOOL}\",\"arguments\":{}}}"
              if ! post_mcp "$TOOLS_CALL_PAYLOAD" "$MCP_PROTOCOL_TOKEN" "$MCP_SESSION_ID"; then
                record fail MCP-PROTO-003 "tools/call transport failed on '$PROBE_TOOL'." "Verify streamable HTTP headers and retry."
              elif [[ ! "$MCP_LAST_STATUS" =~ ^2 ]]; then
                record fail MCP-PROTO-003 "tools/call returned HTTP $MCP_LAST_STATUS on '$PROBE_TOOL'." "Verify auth/session and tool availability."
              else
                CALL_JSON="$(extract_json_payload "$MCP_LAST_BODY")"
                if mcp_has_error "$CALL_JSON"; then
                  record fail MCP-PROTO-003 "tools/call returned JSON-RPC error on '$PROBE_TOOL'." "Verify argument shape from tools/list schema and retry."
                else
                  record pass MCP-PROTO-003 "tools/call probe succeeded with '$PROBE_TOOL'."
                fi
              fi
            fi
          fi
        fi
      fi
    fi
  fi
  fi
else
  record warn MCP-PROTO-000 "Skip protocol probe because API-key auth is not ready." "Resolve auth blockers, then rerun mcp-postcheck."
fi

printf '\nsummary: fail=%d warn=%d pass=%d\n' "$FAIL" "$WARN" "$PASS"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi

exit 0
