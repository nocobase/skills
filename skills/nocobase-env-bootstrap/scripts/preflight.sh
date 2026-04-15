#!/usr/bin/env bash

set -u

DEFAULT_PORT="${1:-13000}"
MCP_REQUIRED="${MCP_REQUIRED:-0}"
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

dotenv_value() {
  local key="$1"
  local file="${2:-.env}"

  if [[ ! -f "$file" ]]; then
    printf ''
    return
  fi

  local line
  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$file" 2>/dev/null | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    printf ''
    return
  fi

  local value
  value="$(printf '%s' "$line" | sed -E 's/^[^=]*=[[:space:]]*//')"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

compose_file_path() {
  local candidate
  for candidate in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
    if [[ -f "$candidate" ]]; then
      printf '%s' "$candidate"
      return
    fi
  done
  printf ''
}

is_placeholder_app_key() {
  local value="$1"
  local normalized
  normalized="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"

  if [[ "$normalized" == *change-me* || "$normalized" == *change_me* ]]; then
    return 0
  fi
  if [[ "$normalized" == *please-change* || "$normalized" == *please_change* ]]; then
    return 0
  fi
  if [[ "$normalized" == *secret-key* || "$normalized" == *secret_key* ]]; then
    return 0
  fi

  return 1
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

printf 'cwd: %s\n' "$(pwd)"
printf 'timestamp: %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if has_cmd docker; then
  if docker --version >/dev/null 2>&1; then
    record pass DEP-DOCKER-001 "Docker detected."
  else
    record fail DEP-DOCKER-001 "Docker command exists but version check failed." "Reinstall Docker."
  fi

  if docker info >/dev/null 2>&1; then
    record pass DEP-DOCKER-002 "Docker daemon is reachable."
  else
    record fail DEP-DOCKER-002 "Docker daemon is not reachable." "Start Docker service."
  fi

  if docker compose version >/dev/null 2>&1; then
    record pass DEP-DOCKER-003 "Docker Compose detected."
  else
    record fail DEP-DOCKER-003 "Docker Compose check failed." "Install Compose v2."
  fi
else
  record warn DEP-DOCKER-001 "Docker not detected." "Install from https://docs.docker.com/get-started/get-docker/"
fi

if has_cmd node; then
  NODE_VERSION="$(node -v 2>/dev/null || true)"
  NODE_MAJOR="$(printf '%s' "$NODE_VERSION" | sed -E 's/^v([0-9]+).*/\1/' 2>/dev/null)"
  if [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] && [[ "$NODE_MAJOR" -ge 20 ]]; then
    record pass DEP-NODE-001 "Node.js version is compatible ($NODE_VERSION)."
  else
    record warn DEP-NODE-001 "Node.js is below recommended version 20 ($NODE_VERSION)." "Install Node.js >= 20."
  fi
else
  record warn DEP-NODE-001 "Node.js not detected." "Install Node.js >= 20 from https://nodejs.org/en/download"
fi

if has_cmd yarn; then
  YARN_VERSION="$(yarn -v 2>/dev/null || true)"
  if [[ "$YARN_VERSION" =~ ^1\.22\. ]]; then
    record pass DEP-YARN-001 "Yarn classic detected ($YARN_VERSION)."
  else
    record warn DEP-YARN-001 "Yarn is not 1.22.x ($YARN_VERSION)." "Install Yarn Classic from https://classic.yarnpkg.com/lang/en/docs/install/"
  fi
else
  record warn DEP-YARN-001 "Yarn not detected." "Install Yarn Classic from https://classic.yarnpkg.com/lang/en/docs/install/"
fi

if has_cmd git; then
  record pass DEP-GIT-001 "Git detected."
else
  record warn DEP-GIT-001 "Git not detected." "Install from https://git-scm.com/install"
fi

if has_cmd ss; then
  if ss -ltn "( sport = :${DEFAULT_PORT} )" 2>/dev/null | grep -q "${DEFAULT_PORT}"; then
    record warn RUNTIME-PORT-001 "Port ${DEFAULT_PORT} is in use." "Choose another APP_PORT or stop conflicting process."
  else
    record pass RUNTIME-PORT-001 "Port ${DEFAULT_PORT} is available."
  fi
elif has_cmd lsof; then
  if lsof -i ":${DEFAULT_PORT}" >/dev/null 2>&1; then
    record warn RUNTIME-PORT-001 "Port ${DEFAULT_PORT} is in use." "Choose another APP_PORT or stop conflicting process."
  else
    record pass RUNTIME-PORT-001 "Port ${DEFAULT_PORT} is available."
  fi
else
  record warn RUNTIME-PORT-001 "Cannot check port ${DEFAULT_PORT}; no ss/lsof available."
fi

if printf '%s' "$(pwd)" | grep -q ' '; then
  record warn PATH-001 "Current path contains spaces." "Use a path without spaces."
else
  record pass PATH-001 "Current path has no spaces."
fi

if has_cmd getent && getent hosts docs.nocobase.com >/dev/null 2>&1; then
  record pass NET-001 "DNS resolution for docs.nocobase.com succeeded."
elif has_cmd nslookup && nslookup docs.nocobase.com >/dev/null 2>&1; then
  record pass NET-001 "DNS resolution for docs.nocobase.com succeeded."
else
  record warn NET-001 "Could not verify DNS reachability." "If offline/restricted, use offline package workflow."
fi

DB_DIALECT_FROM_ENV="$(dotenv_value "DB_DIALECT")"
COMPOSE_FILE_PATH="$(compose_file_path)"
HAS_DB_DIALECT_IN_COMPOSE=0
if [[ -n "$COMPOSE_FILE_PATH" ]] && grep -E 'DB_DIALECT=' "$COMPOSE_FILE_PATH" >/dev/null 2>&1; then
  HAS_DB_DIALECT_IN_COMPOSE=1
fi

if [[ -n "$DB_DIALECT_FROM_ENV" ]]; then
  record pass ENV-001 ".env contains DB_DIALECT."
elif [[ "$HAS_DB_DIALECT_IN_COMPOSE" == "1" ]]; then
  record pass ENV-001 "${COMPOSE_FILE_PATH} contains DB_DIALECT for Docker runtime."
elif [[ -f .env ]]; then
  record warn ENV-001 ".env found but DB_DIALECT is missing, and compose file has no DB_DIALECT." "Set DB_DIALECT in .env or docker-compose app environment before start/upgrade."
else
  record warn ENV-001 ".env not found and compose file has no DB_DIALECT." "Create .env with DB_DIALECT or add DB_DIALECT to docker-compose app environment before start/upgrade."
fi

APP_KEY_VALUE="$(dotenv_value "APP_KEY")"
if [[ -z "$APP_KEY_VALUE" ]]; then
  APP_KEY_VALUE="${APP_KEY:-}"
fi

if [[ -z "$APP_KEY_VALUE" ]]; then
  record fail ENV-APPKEY-001 "APP_KEY is missing." "Generate and set APP_KEY (example: openssl rand -hex 32)."
elif is_placeholder_app_key "$APP_KEY_VALUE"; then
  record fail ENV-APPKEY-001 "APP_KEY uses an insecure placeholder-like value." "Set a random APP_KEY with at least 32 characters; avoid values containing change-me/secret-key."
elif [[ ${#APP_KEY_VALUE} -lt 32 ]]; then
  record fail ENV-APPKEY-001 "APP_KEY is too short (length=${#APP_KEY_VALUE})." "Set a random APP_KEY with at least 32 characters."
elif printf '%s' "$APP_KEY_VALUE" | grep -Eq '[[:space:]]'; then
  record fail ENV-APPKEY-001 "APP_KEY must not include whitespace." "Set a random APP_KEY without spaces."
else
  record pass ENV-APPKEY-001 "APP_KEY is present and appears non-placeholder."
fi

if [[ -n "$COMPOSE_FILE_PATH" ]]; then
  if grep -E 'APP_KEY=\$\{APP_KEY:-please-change-me\}' "$COMPOSE_FILE_PATH" >/dev/null 2>&1; then
    record fail ENV-APPKEY-002 "${COMPOSE_FILE_PATH} still contains insecure APP_KEY fallback 'please-change-me'." "Use required form: APP_KEY=\${APP_KEY:?APP_KEY is required. Set a random value in .env}"
  elif grep -E 'APP_KEY=\$\{APP_KEY:\?' "$COMPOSE_FILE_PATH" >/dev/null 2>&1; then
    record pass ENV-APPKEY-002 "${COMPOSE_FILE_PATH} enforces APP_KEY as required."
  else
    record warn ENV-APPKEY-002 "${COMPOSE_FILE_PATH} APP_KEY rule is not in required-form check." "Ensure compose requires APP_KEY and avoids placeholder fallbacks."
  fi
fi

if [[ "$MCP_REQUIRED" == "1" || "$MCP_REQUIRED" == "true" || "$MCP_REQUIRED" == "TRUE" ]]; then
  APP_BASE_URL="http://127.0.0.1:${DEFAULT_PORT}"
  PLUGIN_MANAGER_URL="${APP_BASE_URL}/admin/settings/plugin-manager"
  API_KEYS_CONFIG_URL="${APP_BASE_URL}/admin/settings/api-keys"
  TARGET_MCP_URL="$(resolve_mcp_url)"
  ACTIVATION_PLUGINS_CSV="$(activation_plugins_csv)"
  PLUGIN_ENABLE_HINT="$(plugin_enable_hint "$ACTIVATION_PLUGINS_CSV")"
  APP_RESTART_HINT="App may still be reloading. Restart app, wait for startup complete, then retry."
  printf 'mcp_target: %s\n' "$TARGET_MCP_URL"
  printf 'mcp_auth_mode: %s\n' "$MCP_AUTH_MODE"
  printf 'mcp_activation_plugins: %s\n' "$ACTIVATION_PLUGINS_CSV"
  printf 'mcp_manual_plugin_manager_url: %s\n' "$PLUGIN_MANAGER_URL"
  printf 'mcp_manual_api_keys_url: %s\n' "$API_KEYS_CONFIG_URL"

  if [[ -n "$MCP_PACKAGES" ]]; then
    record pass MCP-PKG-001 "x-mcp-packages configured ($MCP_PACKAGES)."
  else
    record warn MCP-PKG-001 "x-mcp-packages not set; server default exposure will be used."
  fi

  ROUTE_STATUS="$(http_status "$TARGET_MCP_URL")"
  ROUTE_BLOCKED=0
  if [[ -z "$ROUTE_STATUS" ]]; then
    record warn MCP-ENDPOINT-001 "Cannot verify MCP endpoint reachability." "Ensure app is running and MCP endpoint is reachable."
    ROUTE_BLOCKED=1
  elif [[ "$ROUTE_STATUS" == "404" ]]; then
    record fail MCP-ENDPOINT-001 "MCP endpoint returned 404 ($TARGET_MCP_URL)." "$PLUGIN_ENABLE_HINT"
    emit_activate_plugin_action "$ACTIVATION_PLUGINS_CSV"
    ROUTE_BLOCKED=1
  elif [[ "$ROUTE_STATUS" == "503" || "$ROUTE_STATUS" == 5* ]]; then
    record fail MCP-ENDPOINT-001 "MCP endpoint responded with $ROUTE_STATUS ($TARGET_MCP_URL)." "$APP_RESTART_HINT"
    printf 'action_required: restart_app\n'
    printf 'required_step: restart_app\n'
    printf 'required_step: rerun_mcp_postcheck\n'
    ROUTE_BLOCKED=1
  else
    record pass MCP-ENDPOINT-001 "MCP endpoint route responded with status $ROUTE_STATUS."
  fi

  if [[ "$MCP_AUTH_MODE" == "api-key" ]]; then
    if [[ "$ROUTE_BLOCKED" == "1" ]]; then
      record warn MCP-AUTH-APIKEY-000 "Skip token gate because MCP endpoint is not ready yet." "Resolve endpoint blocker first, then rerun preflight/postcheck."
    else
      TOKEN_VALUE="${!MCP_TOKEN_ENV:-}"
      if [[ -z "$TOKEN_VALUE" ]]; then
        record warn MCP-AUTH-APIKEY-001 "API key token env '$MCP_TOKEN_ENV' is missing." "Token will be auto-generated in mcp-postcheck using CLI; if auto generation fails, fallback to manual API keys page."
      else
        record pass MCP-AUTH-APIKEY-001 "API key token env '$MCP_TOKEN_ENV' is present."
        AUTH_STATUS="$(http_status "$TARGET_MCP_URL" "$TOKEN_VALUE")"
        if [[ -z "$AUTH_STATUS" ]]; then
          record warn MCP-AUTH-APIKEY-002 "Cannot verify API key auth reachability." "Ensure app network path is reachable and retry."
        elif [[ "$AUTH_STATUS" == "404" ]]; then
          record fail MCP-AUTH-APIKEY-002 "MCP endpoint returned 404 in API key probe ($TARGET_MCP_URL)." "$PLUGIN_ENABLE_HINT"
          emit_activate_plugin_action "$ACTIVATION_PLUGINS_CSV"
        elif [[ "$AUTH_STATUS" == "503" || "$AUTH_STATUS" == 5* ]]; then
          record fail MCP-AUTH-APIKEY-002 "MCP endpoint responded with $AUTH_STATUS in API key probe ($TARGET_MCP_URL)." "$APP_RESTART_HINT"
          printf 'action_required: restart_app\n'
          printf 'required_step: restart_app\n'
          printf 'required_step: rerun_mcp_postcheck\n'
        elif [[ "$AUTH_STATUS" == "401" || "$AUTH_STATUS" == "403" ]]; then
          record warn MCP-AUTH-APIKEY-002 "MCP API key auth probe returned $AUTH_STATUS." "Token may be expired; mcp-postcheck will auto-refresh token via CLI, with manual fallback only if automation fails."
        else
          record pass MCP-AUTH-APIKEY-002 "MCP API key auth probe responded with status $AUTH_STATUS."
        fi
      fi
    fi
  elif [[ "$MCP_AUTH_MODE" == "oauth" ]]; then
    record warn MCP-AUTH-OAUTH-001 "OAuth flow requires interactive login and cannot be fully validated in preflight." "Run client login with scopes mcp,offline_access after startup."
  else
    record warn MCP-AUTH-000 "MCP auth probe disabled (mode=none)." "Use api-key or oauth mode when MCP access is required."
  fi
fi

printf '\nsummary: fail=%d warn=%d pass=%d\n' "$FAIL" "$WARN" "$PASS"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi

exit 0
