#!/usr/bin/env bash

set -u

DEFAULT_PORT="${1:-13000}"
MCP_AUTH_MODE="${MCP_AUTH_MODE:-none}"
MCP_URL="${MCP_URL:-}"
MCP_APP_NAME="${MCP_APP_NAME:-}"
MCP_TOKEN_ENV="${MCP_TOKEN_ENV:-NOCOBASE_API_TOKEN}"
MCP_PACKAGES="${MCP_PACKAGES:-}"
FAIL=0
WARN=0
PASS=0

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

http_status() {
  local url="$1"
  local token="${2:-}"

  if ! has_cmd curl; then
    printf ''
    return
  fi

  local status
  if [[ -n "$token" ]]; then
    status="$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" --connect-timeout 8 --max-time 10 "$url" || true)"
  else
    status="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 8 --max-time 10 "$url" || true)"
  fi

  if [[ "$status" == "000" ]]; then
    printf ''
  else
    printf '%s' "$status"
  fi
}

APP_BASE_URL="http://127.0.0.1:${DEFAULT_PORT}"
PLUGIN_MANAGER_URL="${APP_BASE_URL}/admin/settings/plugin-manager"
API_KEYS_CONFIG_URL="${APP_BASE_URL}/admin/settings/api-keys"
TARGET_MCP_URL="$(resolve_mcp_url)"
ACTIVATION_PLUGINS_CSV="$(activation_plugins_csv)"
PLUGIN_ENABLE_HINT="$(plugin_enable_hint "$ACTIVATION_PLUGINS_CSV")"
APP_RESTART_HINT="App may still be reloading. Restart app, wait for startup complete, then rerun postcheck."
API_KEY_CREATE_HINT="Manual only after plugin bundle is active: open ${API_KEYS_CONFIG_URL}, click Add API Key, copy token, set ${MCP_TOKEN_ENV}, then rerun postcheck. Do not auto-create or auto-retrieve token via CLI/API/DB/UI automation."

printf 'phase: mcp-postcheck\n'
printf 'timestamp: %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
printf 'mcp_target: %s\n' "$TARGET_MCP_URL"
printf 'mcp_auth_mode: %s\n' "$MCP_AUTH_MODE"
printf 'mcp_activation_plugins: %s\n' "$ACTIVATION_PLUGINS_CSV"
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
    if [[ -z "$TOKEN_VALUE" ]]; then
      record fail MCP-AUTH-POST-APIKEY-001 "API key token env '$MCP_TOKEN_ENV' is missing." "$API_KEY_CREATE_HINT"
      printf 'action_required: provide_api_token\n'
      printf 'required_step: manual_user_create_token\n'
      printf 'required_step: manual_user_send_token_in_chat\n'
      printf 'required_step: no_agent_token_automation\n'
    else
      record pass MCP-AUTH-POST-APIKEY-001 "API key token env '$MCP_TOKEN_ENV' is present."
      AUTH_STATUS="$(http_status "$TARGET_MCP_URL" "$TOKEN_VALUE")"
      if [[ -z "$AUTH_STATUS" ]]; then
        record fail MCP-AUTH-POST-APIKEY-002 "Cannot verify API key auth reachability." "Ensure app route is reachable, then rerun postcheck."
      elif [[ "$AUTH_STATUS" == "404" ]]; then
        record fail MCP-AUTH-POST-APIKEY-002 "MCP endpoint returned 404 in API key probe ($TARGET_MCP_URL)." "$PLUGIN_ENABLE_HINT"
        emit_activate_plugin_action "$ACTIVATION_PLUGINS_CSV"
      elif [[ "$AUTH_STATUS" == "503" || "$AUTH_STATUS" == 5* ]]; then
        record fail MCP-AUTH-POST-APIKEY-002 "MCP endpoint responded with $AUTH_STATUS in API key probe ($TARGET_MCP_URL)." "$APP_RESTART_HINT"
        printf 'action_required: restart_app\n'
        printf 'required_step: restart_app\n'
        printf 'required_step: rerun_mcp_postcheck\n'
      elif [[ "$AUTH_STATUS" == "401" || "$AUTH_STATUS" == "403" ]]; then
        record fail MCP-AUTH-POST-APIKEY-002 "MCP API key auth probe returned $AUTH_STATUS." "Open $API_KEYS_CONFIG_URL, regenerate API key, update $MCP_TOKEN_ENV, then rerun postcheck."
        printf 'action_required: provide_api_token\n'
        printf 'required_step: manual_user_create_token\n'
        printf 'required_step: manual_user_send_token_in_chat\n'
        printf 'required_step: no_agent_token_automation\n'
      else
        record pass MCP-AUTH-POST-APIKEY-002 "MCP API key auth probe responded with status $AUTH_STATUS."
      fi
    fi
  fi
elif [[ "$MCP_AUTH_MODE" == "oauth" ]]; then
  record warn MCP-AUTH-POST-OAUTH-001 "OAuth postcheck requires interactive client login." "Run client login with scopes mcp,offline_access."
else
  record warn MCP-AUTH-POST-000 "MCP auth probe disabled (mode=none)." "Use api-key or oauth when MCP access is required."
fi

printf '\nsummary: fail=%d warn=%d pass=%d\n' "$FAIL" "$WARN" "$PASS"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi

exit 0
