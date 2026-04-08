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

if [[ -f .env ]]; then
  if grep -E '^[[:space:]]*DB_DIALECT[[:space:]]*=' .env >/dev/null 2>&1; then
    record pass ENV-001 ".env contains DB_DIALECT."
  else
    record warn ENV-001 ".env found but DB_DIALECT is missing." "Set DB_DIALECT before start/upgrade."
  fi
else
  record warn ENV-001 ".env not found in current directory." "Create .env before start/upgrade."
fi

if [[ "$MCP_REQUIRED" == "1" || "$MCP_REQUIRED" == "true" || "$MCP_REQUIRED" == "TRUE" ]]; then
  TARGET_MCP_URL="$(resolve_mcp_url)"
  printf 'mcp_target: %s\n' "$TARGET_MCP_URL"
  printf 'mcp_auth_mode: %s\n' "$MCP_AUTH_MODE"

  if [[ -n "$MCP_PACKAGES" ]]; then
    record pass MCP-PKG-001 "x-mcp-packages configured ($MCP_PACKAGES)."
  else
    record warn MCP-PKG-001 "x-mcp-packages not set; server default exposure will be used."
  fi

  ROUTE_STATUS="$(http_status "$TARGET_MCP_URL")"
  if [[ -z "$ROUTE_STATUS" ]]; then
    record warn MCP-ENDPOINT-001 "Cannot verify MCP endpoint reachability." "Ensure app is running and MCP endpoint is reachable."
  elif [[ "$ROUTE_STATUS" == "404" ]]; then
    record fail MCP-ENDPOINT-001 "MCP endpoint returned 404 ($TARGET_MCP_URL)." "Activate MCP Server plugin manually in NocoBase admin, then retry preflight."
  else
    record pass MCP-ENDPOINT-001 "MCP endpoint route responded with status $ROUTE_STATUS."
  fi

  if [[ "$MCP_AUTH_MODE" == "api-key" ]]; then
    TOKEN_VALUE="${!MCP_TOKEN_ENV:-}"
    if [[ -z "$TOKEN_VALUE" ]]; then
      record fail MCP-AUTH-APIKEY-001 "API key token env '$MCP_TOKEN_ENV' is missing." "Activate API Keys plugin manually in NocoBase admin, create an API key, set $MCP_TOKEN_ENV, then retry."
    else
      record pass MCP-AUTH-APIKEY-001 "API key token env '$MCP_TOKEN_ENV' is present."
      AUTH_STATUS="$(http_status "$TARGET_MCP_URL" "$TOKEN_VALUE")"
      if [[ -z "$AUTH_STATUS" ]]; then
        record warn MCP-AUTH-APIKEY-002 "Cannot verify API key auth reachability." "Ensure app network path is reachable and retry."
      elif [[ "$AUTH_STATUS" == "404" ]]; then
        record fail MCP-AUTH-APIKEY-002 "MCP endpoint returned 404 in API key probe ($TARGET_MCP_URL)." "Activate MCP Server plugin manually in NocoBase admin, then retry."
      elif [[ "$AUTH_STATUS" == "401" || "$AUTH_STATUS" == "403" ]]; then
        record fail MCP-AUTH-APIKEY-002 "MCP API key auth probe returned $AUTH_STATUS." "Activate API Keys plugin manually in NocoBase admin, regenerate API key, update token env var, then retry."
      else
        record pass MCP-AUTH-APIKEY-002 "MCP API key auth probe responded with status $AUTH_STATUS."
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
