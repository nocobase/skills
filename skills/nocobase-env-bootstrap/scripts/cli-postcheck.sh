#!/usr/bin/env bash

set -u

PORT="${1:-13000}"
ENV_NAME="${2:-local}"
TOKEN_ENV="${3:-NOCOBASE_API_TOKEN}"
SCOPE="${4:-project}"
BASE_DIR_INPUT="${5:-${BASE_DIR:-}}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}/api}"
AUTH_MODE="${AUTH_MODE:-oauth}"
SKIP_UPDATE="${SKIP_UPDATE:-0}"
CLI_AUTO_API_KEY="${CLI_AUTO_API_KEY:-1}"
CLI_AUTO_API_KEY_NAME="${CLI_AUTO_API_KEY_NAME:-cli_auto_token}"
CLI_AUTO_API_KEY_USERNAME="${CLI_AUTO_API_KEY_USERNAME:-nocobase}"
CLI_AUTO_API_KEY_ROLE="${CLI_AUTO_API_KEY_ROLE:-root}"
CLI_AUTO_API_KEY_EXPIRES_IN="${CLI_AUTO_API_KEY_EXPIRES_IN:-30d}"
CLI_AUTO_API_KEY_APP_SERVICE="${CLI_AUTO_API_KEY_APP_SERVICE:-app}"
CLI_AUTO_API_KEY_COMPOSE_FILE="${CLI_AUTO_API_KEY_COMPOSE_FILE:-}"

FAIL=0
WARN=0
PASS=0
if [[ "$AUTH_MODE" == "oauth" ]]; then
  CLI_DEPENDENCY_PLUGINS='@nocobase/plugin-api-doc,@nocobase/plugin-idp-oauth'
  CLI_DEPENDENCY_ENABLE_CMD='Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc @nocobase/plugin-idp-oauth'
else
  if [[ "$AUTH_MODE" != "token" ]]; then
    AUTH_MODE="token"
  fi
  CLI_DEPENDENCY_PLUGINS='@nocobase/plugin-api-doc,@nocobase/plugin-api-keys'
  CLI_DEPENDENCY_ENABLE_CMD='Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc @nocobase/plugin-api-keys'
fi
INSTALL_GUIDE='https://github.com/nocobase/nocobase-ctl'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CTL_WRAPPER="${SCRIPT_DIR}/run-ctl.mjs"
BASE_DIR=""

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

emit_token_fix_action() {
  printf 'action_required: refresh_cli_token\n'
  printf 'required_step: ensure_api_keys_plugin_active\n'
  printf 'required_step: regenerate_or_update_cli_token_env\n'
  printf 'required_step: rerun_cli_postcheck\n'
  printf 'required_plugins: %s\n' "$CLI_DEPENDENCY_PLUGINS"
  printf 'suggested_command: %s\n' "$CLI_DEPENDENCY_ENABLE_CMD"
}

resolve_abs_dir() {
  local input="${1:-}"
  if [[ -z "$input" ]]; then
    pwd
    return 0
  fi

  if [[ -d "$input" ]]; then
    (cd "$input" && pwd)
    return 0
  fi

  return 1
}

resolve_compose_file() {
  if [[ -n "$CLI_AUTO_API_KEY_COMPOSE_FILE" ]]; then
    local candidate="$CLI_AUTO_API_KEY_COMPOSE_FILE"
    if [[ "$candidate" != /* ]]; then
      candidate="${BASE_DIR}/${candidate}"
    fi
    if [[ -f "$candidate" ]]; then
      printf '%s' "$candidate"
      return
    fi
    printf ''
    return
  fi

  local candidate
  for candidate in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
    if [[ -f "${BASE_DIR}/${candidate}" ]]; then
      printf '%s' "${BASE_DIR}/${candidate}"
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
    output="$(cd "$BASE_DIR" && yarn nocobase generate-api-key -n "$CLI_AUTO_API_KEY_NAME" -r "$CLI_AUTO_API_KEY_ROLE" -u "$CLI_AUTO_API_KEY_USERNAME" -e "$CLI_AUTO_API_KEY_EXPIRES_IN" --silent 2>&1 || true)"
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
    cmd+=(exec -T "$CLI_AUTO_API_KEY_APP_SERVICE" yarn nocobase generate-api-key -n "$CLI_AUTO_API_KEY_NAME" -r "$CLI_AUTO_API_KEY_ROLE" -u "$CLI_AUTO_API_KEY_USERNAME" -e "$CLI_AUTO_API_KEY_EXPIRES_IN" --silent)

    output="$(cd "$BASE_DIR" && "${cmd[@]}" 2>&1 || true)"
    token="$(extract_api_key_token "$output")"
    if [[ -n "$token" ]]; then
      AUTO_TOKEN_VALUE="$token"
      AUTO_TOKEN_SOURCE="docker-compose-exec"
      return 0
    fi
  fi

  return 1
}

run_ctl_capture() {
  node "$CTL_WRAPPER" --base-dir "$BASE_DIR" -- "$@" 2>&1
}

if ! BASE_DIR="$(resolve_abs_dir "$BASE_DIR_INPUT")"; then
  record fail CLI-001 "Base directory does not exist: ${BASE_DIR_INPUT}" 'Pass a valid app root directory as the 5th arg or BASE_DIR env.'
  printf 'summary: fail=%d warn=%d pass=%d\n' "$FAIL" "$WARN" "$PASS"
  exit 1
fi

if ! has_cmd node; then
  record fail CLI-001 "Cannot find Node.js in PATH." "Install Node.js first. Then install nocobase-ctl from ${INSTALL_GUIDE}"
  printf 'summary: fail=%d warn=%d pass=%d\n' "$FAIL" "$WARN" "$PASS"
  exit 1
fi

if [[ ! -f "$CTL_WRAPPER" ]]; then
  record fail CLI-001 "Cannot find skill-local ctl wrapper: ${CTL_WRAPPER}" 'Ensure nocobase-env-bootstrap/scripts/run-ctl.mjs exists, then rerun postcheck.'
  printf 'summary: fail=%d warn=%d pass=%d\n' "$FAIL" "$WARN" "$PASS"
  exit 1
fi

AUTO_API_KEY_ENABLED=0
if [[ "$CLI_AUTO_API_KEY" == "1" ]]; then
  AUTO_API_KEY_ENABLED=1
fi
API_KEY_CREATE_HINT="Auto token generation failed. Fallback manual only: enable @nocobase/plugin-api-keys, generate API key, set ${TOKEN_ENV}, then rerun postcheck."
API_KEY_AUTO_HINT="Auto token generation uses CLI: generate-api-key -n ${CLI_AUTO_API_KEY_NAME} -u ${CLI_AUTO_API_KEY_USERNAME} -r ${CLI_AUTO_API_KEY_ROLE} -e ${CLI_AUTO_API_KEY_EXPIRES_IN}."

record pass CLI-001 "Detected skill-local ctl wrapper: ${CTL_WRAPPER}"
printf 'cli_base_dir: %s\n' "$BASE_DIR"
printf 'cli_auto_api_key: %s\n' "$([[ "$AUTO_API_KEY_ENABLED" == "1" ]] && printf enabled || printf disabled)"
printf 'cli_auth_mode: %s\n' "$AUTH_MODE"
printf 'cli_target_env: %s\n' "$ENV_NAME"
printf 'cli_base_url: %s\n' "$BASE_URL"
printf 'cli_scope: %s\n' "$SCOPE"

if [[ "$AUTH_MODE" == "oauth" ]]; then
  record pass CLI-002 "OAuth mode selected; token env '${TOKEN_ENV}' is not required for bootstrap."
  ENV_MANAGE="${SCRIPT_DIR}/env-manage.mjs"
  if [[ ! -f "$ENV_MANAGE" ]]; then
    record fail CLI-003 "Cannot find env-manage script: ${ENV_MANAGE}" 'Ensure nocobase-env-bootstrap/scripts/env-manage.mjs exists, then rerun postcheck.'
    printf 'summary: fail=%d warn=%d pass=%d\n' "$FAIL" "$WARN" "$PASS"
    exit 1
  fi

  OAUTH_LOG_FILE="$(mktemp)"
  node "$ENV_MANAGE" add --name "$ENV_NAME" --url "$BASE_URL" --auth-mode oauth --scope "$SCOPE" --base-dir "$BASE_DIR" 2>&1 | tee "$OAUTH_LOG_FILE"
  OAUTH_ADD_EXIT="${PIPESTATUS[0]}"
  OAUTH_ADD_OUTPUT="$(cat "$OAUTH_LOG_FILE")"
  rm -f "$OAUTH_LOG_FILE"

  if [[ "$OAUTH_ADD_EXIT" -eq 0 ]]; then
    record pass CLI-003 "OAuth env bootstrap completed for '${ENV_NAME}'."
    record pass CLI-004 "Runtime update completed in OAuth flow."
    record pass CLI-005 "Readback completed in OAuth flow."
  else
    OAUTH_AUTHORIZATION_URL="$(printf '%s\n' "$OAUTH_ADD_OUTPUT" | sed -n 's/^[[:space:]]*"oauth_authorization_url":[[:space:]]*"\(https\?:\/\/[^"]*\)".*$/\1/p' | head -n 1)"
    if [[ -z "$OAUTH_AUTHORIZATION_URL" ]]; then
      OAUTH_AUTHORIZATION_URL="$(printf '%s\n' "$OAUTH_ADD_OUTPUT" | grep -Eo 'https?://[^[:space:]"]+' | grep -E 'response_type=code|/authorize' | head -n 1 || true)"
    fi
    if printf '%s' "$OAUTH_ADD_OUTPUT" | grep -q 'ENV_OAUTH_INTERACTIVE_REQUIRED\|ENV_OAUTH_AUTH_FAILED\|complete_oauth_login' || [[ -n "$OAUTH_AUTHORIZATION_URL" ]]; then
      LOGIN_COMMAND="$(printf '%s\n' "$OAUTH_ADD_OUTPUT" | sed -n 's/^[[:space:]]*"login_command":[[:space:]]*"\(.*\)",\{0,1\}[[:space:]]*$/\1/p' | head -n 1)"
      LOGIN_COMMAND="${LOGIN_COMMAND//\\\\/\\}"
      LOGIN_COMMAND="${LOGIN_COMMAND//\\\"/\"}"
      record fail CLI-003 "OAuth env bootstrap is waiting for browser authorization or requires retry." 'Open oauth_authorization_url (if provided) and complete login, or run login_command, then rerun cli-postcheck.'
      printf 'action_required: complete_oauth_login\n'
      printf 'required_step: open_oauth_authorization_url_or_run_login_command\n'
      if [[ -n "$OAUTH_AUTHORIZATION_URL" ]]; then
        printf 'oauth_authorization_url: %s\n' "$OAUTH_AUTHORIZATION_URL"
      fi
      if [[ -n "$LOGIN_COMMAND" ]]; then
        printf 'login_command: %s\n' "$LOGIN_COMMAND"
      fi
      printf 'login_behavior: env_auth_will_open_browser_or_print_authorization_url\n'
      printf 'required_step: rerun_cli_postcheck\n'
    else
      record fail CLI-003 "OAuth env bootstrap failed." 'Fix the error in env-manage output and rerun postcheck.'
    fi
  fi

  printf 'summary: fail=%d warn=%d pass=%d\n' "$FAIL" "$WARN" "$PASS"
  if [[ "$FAIL" -gt 0 ]]; then
    exit 1
  fi
  exit 0
fi

TOKEN_VALUE="${!TOKEN_ENV:-}"
if [[ -z "$TOKEN_VALUE" && "$AUTO_API_KEY_ENABLED" == "1" ]]; then
  record warn CLI-002 "Token env '${TOKEN_ENV}' is missing. Trying automatic token generation." "$API_KEY_AUTO_HINT"
  if auto_generate_api_key; then
    TOKEN_VALUE="$AUTO_TOKEN_VALUE"
    export "$TOKEN_ENV=$TOKEN_VALUE"
    record pass CLI-002 "Automatically generated API token from ${AUTO_TOKEN_SOURCE} and loaded into '${TOKEN_ENV}' ($(token_preview "$TOKEN_VALUE"))."
  else
    record fail CLI-002 "Automatic token generation failed for '${TOKEN_ENV}'." "$API_KEY_CREATE_HINT"
    printf 'action_required: provide_cli_token\n'
    printf 'required_step: auto_generate_cli_token_failed\n'
    printf 'required_step: ensure_api_keys_plugin_active\n'
    printf 'required_step: set_cli_token_env\n'
    printf 'required_step: rerun_cli_postcheck\n'
    printf 'required_plugins: %s\n' "$CLI_DEPENDENCY_PLUGINS"
    printf 'suggested_command: %s\n' "$CLI_DEPENDENCY_ENABLE_CMD"
    printf 'summary: fail=%d warn=%d pass=%d\n' "$FAIL" "$WARN" "$PASS"
    exit 1
  fi
elif [[ -z "$TOKEN_VALUE" ]]; then
  record fail CLI-002 "Token env '${TOKEN_ENV}' is missing and auto generation is disabled." 'Enable @nocobase/plugin-api-keys, generate/copy API token, set token env, then rerun.'
  printf 'action_required: provide_cli_token\n'
  printf 'required_step: ensure_api_keys_plugin_active\n'
  printf 'required_step: set_cli_token_env\n'
  printf 'required_step: rerun_cli_postcheck\n'
  printf 'required_plugins: %s\n' "$CLI_DEPENDENCY_PLUGINS"
  printf 'suggested_command: %s\n' "$CLI_DEPENDENCY_ENABLE_CMD"
  printf 'summary: fail=%d warn=%d pass=%d\n' "$FAIL" "$WARN" "$PASS"
  exit 1
else
  record pass CLI-002 "Token env '${TOKEN_ENV}' is present."
fi

if ENV_ADD_OUTPUT="$(run_ctl_capture env add --name "$ENV_NAME" --base-url "$BASE_URL" --token "$TOKEN_VALUE" -s "$SCOPE")"; then
  printf '%s\n' "$ENV_ADD_OUTPUT"
  record pass CLI-003 "Added or updated env '${ENV_NAME}' in ${SCOPE} scope."
else
  printf '%s\n' "$ENV_ADD_OUTPUT"
  if printf '%s' "$ENV_ADD_OUTPUT" | grep -Eiq '401|403|Auth required|Missing token|Invalid API token|invalid token'; then
    if [[ "$AUTO_API_KEY_ENABLED" == "1" ]]; then
      record warn CLI-003 "Failed to add env '${ENV_NAME}': auth/token issue detected. Trying automatic refresh." "$API_KEY_AUTO_HINT"
      if auto_generate_api_key; then
        TOKEN_VALUE="$AUTO_TOKEN_VALUE"
        export "$TOKEN_ENV=$TOKEN_VALUE"
        if ENV_ADD_RETRY_OUTPUT="$(run_ctl_capture env add --name "$ENV_NAME" --base-url "$BASE_URL" --token "$TOKEN_VALUE" -s "$SCOPE")"; then
          printf '%s\n' "$ENV_ADD_RETRY_OUTPUT"
          record pass CLI-003 "Added or updated env '${ENV_NAME}' after automatic token refresh from ${AUTO_TOKEN_SOURCE}."
        else
          printf '%s\n' "$ENV_ADD_RETRY_OUTPUT"
          record fail CLI-003 "Failed to add env '${ENV_NAME}' after automatic token refresh." "$API_KEY_CREATE_HINT"
          emit_token_fix_action
        fi
      else
        record fail CLI-003 "Failed to add env '${ENV_NAME}': auth/token issue detected and automatic refresh failed." "$API_KEY_CREATE_HINT"
        emit_token_fix_action
      fi
    else
      record fail CLI-003 "Failed to add env '${ENV_NAME}': auth/token issue detected." "$API_KEY_CREATE_HINT"
      emit_token_fix_action
    fi
  else
    record fail CLI-003 "Failed to add env '${ENV_NAME}'." 'Check base URL, token, and CLI runtime then retry.'
  fi
fi

if [[ "$SKIP_UPDATE" != "1" && "$FAIL" -eq 0 ]]; then
  if ENV_UPDATE_OUTPUT="$(run_ctl_capture env update -e "$ENV_NAME" -s "$SCOPE")"; then
    printf '%s\n' "$ENV_UPDATE_OUTPUT"
    record pass CLI-004 "Updated runtime for env '${ENV_NAME}'."
  else
    printf '%s\n' "$ENV_UPDATE_OUTPUT"
    if printf '%s' "$ENV_UPDATE_OUTPUT" | grep -Eiq 'swagger:get|API documentation plugin|api-doc'; then
      record fail CLI-004 "Failed to update runtime for env '${ENV_NAME}': API documentation dependency is not ready." 'Enable @nocobase/plugin-api-doc and @nocobase/plugin-api-keys, restart app, then rerun postcheck.'
      printf 'action_required: enable_cli_dependency_plugins\n'
      printf 'required_step: plugin_manage_enable_cli_bundle\n'
      printf 'required_step: restart_app\n'
      printf 'required_step: rerun_cli_postcheck\n'
      printf 'required_plugins: %s\n' "$CLI_DEPENDENCY_PLUGINS"
      printf 'suggested_command: %s\n' "$CLI_DEPENDENCY_ENABLE_CMD"
    elif printf '%s' "$ENV_UPDATE_OUTPUT" | grep -Eiq '401|403|Auth required|Missing token|Invalid API token|invalid token'; then
      if [[ "$AUTO_API_KEY_ENABLED" == "1" ]]; then
        record warn CLI-004 "Failed to update runtime for env '${ENV_NAME}': auth/token issue detected. Trying automatic refresh." "$API_KEY_AUTO_HINT"
        if auto_generate_api_key; then
          TOKEN_VALUE="$AUTO_TOKEN_VALUE"
          export "$TOKEN_ENV=$TOKEN_VALUE"
          if ENV_REFRESH_OUTPUT="$(run_ctl_capture env add --name "$ENV_NAME" --base-url "$BASE_URL" --token "$TOKEN_VALUE" -s "$SCOPE")"; then
            printf '%s\n' "$ENV_REFRESH_OUTPUT"
            if ENV_UPDATE_RETRY_OUTPUT="$(run_ctl_capture env update -e "$ENV_NAME" -s "$SCOPE")"; then
              printf '%s\n' "$ENV_UPDATE_RETRY_OUTPUT"
              record pass CLI-004 "Updated runtime for env '${ENV_NAME}' after automatic token refresh from ${AUTO_TOKEN_SOURCE}."
            else
              printf '%s\n' "$ENV_UPDATE_RETRY_OUTPUT"
              record fail CLI-004 "Failed to update runtime for env '${ENV_NAME}' after automatic token refresh." "$API_KEY_CREATE_HINT"
              emit_token_fix_action
            fi
          else
            printf '%s\n' "$ENV_REFRESH_OUTPUT"
            record fail CLI-004 "Failed to refresh env '${ENV_NAME}' token before update retry." "$API_KEY_CREATE_HINT"
            emit_token_fix_action
          fi
        else
          record fail CLI-004 "Failed to update runtime for env '${ENV_NAME}': automatic token refresh failed." "$API_KEY_CREATE_HINT"
          emit_token_fix_action
        fi
      else
        record fail CLI-004 "Failed to update runtime for env '${ENV_NAME}': auth/token issue detected." 'Enable @nocobase/plugin-api-keys, refresh token env, and retry.'
        emit_token_fix_action
      fi
    else
      record fail CLI-004 "Failed to update runtime for env '${ENV_NAME}'." 'Ensure app is reachable and token has required permission.'
    fi
  fi
elif [[ "$SKIP_UPDATE" == "1" ]]; then
  record warn CLI-004 'Skipped env update by flag.'
fi

if [[ "$FAIL" -eq 0 ]]; then
  if READBACK="$(run_ctl_capture env -s "$SCOPE")"; then
    printf '%s\n' "$READBACK"
    if printf '%s' "$READBACK" | grep -F "$ENV_NAME" >/dev/null 2>&1 && printf '%s' "$READBACK" | grep -F "$BASE_URL" >/dev/null 2>&1; then
      record pass CLI-005 'Readback confirms expected env and base URL.'
    else
      record warn CLI-005 'Readback completed but expected env/base URL was not clearly found in output.' 'Inspect `node ./scripts/run-ctl.mjs -- env -s <scope>` output manually.'
    fi
  else
    printf '%s\n' "$READBACK"
    record fail CLI-005 'Readback failed.' 'Run `node ./scripts/run-ctl.mjs -- env -s <scope>` manually and verify.'
  fi
fi

printf 'summary: fail=%d warn=%d pass=%d\n' "$FAIL" "$WARN" "$PASS"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi

exit 0
