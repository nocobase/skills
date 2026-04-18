#!/usr/bin/env bash

set -u

DEFAULT_PORT="${1:-13000}"
INSTALL_METHOD="${2:-${INSTALL_METHOD:-docker}}"
DB_MODE="${3:-${DB_MODE:-bundled}}"
DB_DIALECT_INPUT="${4:-${DB_DIALECT:-}}"
DB_DATABASE_MODE_INPUT="${5:-${DB_DATABASE_MODE:-existing}}"
MCP_REQUIRED="${MCP_REQUIRED:-0}"
MCP_AUTH_MODE="${MCP_AUTH_MODE:-none}"
MCP_URL="${MCP_URL:-}"
MCP_APP_NAME="${MCP_APP_NAME:-}"
MCP_TOKEN_ENV="${MCP_TOKEN_ENV:-NOCOBASE_API_TOKEN}"
MCP_PACKAGES="${MCP_PACKAGES:-}"
DB_HOST_INPUT="${DB_HOST:-}"
DB_PORT_INPUT="${DB_PORT:-}"
DB_DATABASE_INPUT="${DB_DATABASE:-}"
DB_USER_INPUT="${DB_USER:-}"
DB_PASSWORD_INPUT="${DB_PASSWORD:-}"
POSTGRES_INSTALL_URL='https://www.postgresql.org/download/'
MYSQL_INSTALL_URL='https://dev.mysql.com/doc/en/installing.html'
MYSQL_DOWNLOAD_URL='https://dev.mysql.com/downloads/mysql'
MARIADB_INSTALL_URL='https://mariadb.org/download/'
FAIL=0
WARN=0
PASS=0

case "$INSTALL_METHOD" in
  docker|create-nocobase-app|git) ;;
  *)
    printf '[fail] INPUT-001: Invalid INSTALL_METHOD "%s".\n' "$INSTALL_METHOD"
    printf '  fix: Use one of docker/create-nocobase-app/git.\n'
    exit 1
    ;;
esac

case "$DB_MODE" in
  bundled|existing) ;;
  *)
    printf '[fail] INPUT-002: Invalid DB_MODE "%s".\n' "$DB_MODE"
    printf '  fix: Use one of bundled/existing.\n'
    exit 1
    ;;
esac

case "$DB_DATABASE_MODE_INPUT" in
  existing|create) ;;
  *)
    printf '[fail] INPUT-004: Invalid DB_DATABASE_MODE "%s".\n' "$DB_DATABASE_MODE_INPUT"
    printf '  fix: Use one of existing/create.\n'
    exit 1
    ;;
esac

is_method_docker() {
  [[ "$INSTALL_METHOD" == "docker" ]]
}

is_method_create_or_git() {
  [[ "$INSTALL_METHOD" == "create-nocobase-app" || "$INSTALL_METHOD" == "git" ]]
}

is_method_git() {
  [[ "$INSTALL_METHOD" == "git" ]]
}

has_external_db_inputs() {
  [[ -n "$DB_HOST_INPUT" || -n "$DB_PORT_INPUT" || -n "$DB_DATABASE_INPUT" || -n "$DB_USER_INPUT" || -n "$DB_PASSWORD_INPUT" ]]
}

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

emit_db_install_action() {
  printf 'action_required: install_or_configure_database\n'
  printf 'postgres_install_url: %s\n' "$POSTGRES_INSTALL_URL"
  printf 'mysql_install_url: %s\n' "$MYSQL_INSTALL_URL"
  printf 'mysql_download_url: %s\n' "$MYSQL_DOWNLOAD_URL"
  printf 'mariadb_install_url: %s\n' "$MARIADB_INSTALL_URL"
}

tcp_reachable() {
  local host="$1"
  local port="$2"

  if has_cmd nc; then
    nc -z -w 3 "$host" "$port" >/dev/null 2>&1
    return $?
  fi

  if has_cmd timeout; then
    timeout 3 bash -c ":</dev/tcp/${host}/${port}" >/dev/null 2>&1
    return $?
  fi

  return 2
}

escape_sql_literal() {
  printf '%s' "$1" | sed "s/'/''/g"
}

quote_postgres_identifier() {
  local raw="$1"
  local escaped
  escaped="$(printf '%s' "$raw" | sed 's/"/""/g')"
  printf '"%s"' "$escaped"
}

quote_mysql_identifier() {
  local raw="$1"
  local escaped
  escaped="$(printf '%s' "$raw" | sed 's/`/``/g')"
  printf '`%s`' "$escaped"
}

ensure_db_created_if_requested() {
  if [[ "$DB_DATABASE_MODE_RESOLVED" != "create" ]]; then
    record pass DB-CREATE-001 "Database creation mode is existing; creation step skipped."
    return 0
  fi

  if [[ "$DB_DIALECT_RESOLVED" == "postgres" ]]; then
    if ! has_cmd psql; then
      record fail DB-CREATE-001 "db_database_mode=create requires psql client for postgres." "Install PostgreSQL client tools and retry."
      return 1
    fi

    local db_literal db_identifier exists
    db_literal="$(escape_sql_literal "$DB_DATABASE_RESOLVED")"
    db_identifier="$(quote_postgres_identifier "$DB_DATABASE_RESOLVED")"
    exists="$(PGPASSWORD="$DB_PASSWORD_RESOLVED" psql -h "$DB_HOST_RESOLVED" -p "$DB_PORT_RESOLVED" -U "$DB_USER_RESOLVED" -d postgres -tA -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname='${db_literal}' LIMIT 1;" 2>/dev/null | tr -d '[:space:]')"

    if [[ "$exists" == "1" ]]; then
      record pass DB-CREATE-001 "Target database already exists (${DB_DATABASE_RESOLVED})."
      return 0
    fi

    if PGPASSWORD="$DB_PASSWORD_RESOLVED" psql -h "$DB_HOST_RESOLVED" -p "$DB_PORT_RESOLVED" -U "$DB_USER_RESOLVED" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${db_identifier};" >/dev/null 2>&1; then
      record pass DB-CREATE-001 "Created target database (${DB_DATABASE_RESOLVED})."
      return 0
    fi

    record fail DB-CREATE-001 "Failed to create target database (${DB_DATABASE_RESOLVED})." "Check DB_USER permissions (CREATE DATABASE) or create database manually, then retry."
    return 1
  fi

  if ! has_cmd mysql; then
    record fail DB-CREATE-001 "db_database_mode=create requires mysql client for mysql/mariadb." "Install mysql client tools and retry."
    return 1
  fi

  local db_literal db_identifier exists
  db_literal="$(escape_sql_literal "$DB_DATABASE_RESOLVED")"
  db_identifier="$(quote_mysql_identifier "$DB_DATABASE_RESOLVED")"
  exists="$(MYSQL_PWD="$DB_PASSWORD_RESOLVED" mysql --protocol=TCP -h "$DB_HOST_RESOLVED" -P "$DB_PORT_RESOLVED" -u "$DB_USER_RESOLVED" --connect-timeout=5 --batch --skip-column-names -e "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='${db_literal}' LIMIT 1;" 2>/dev/null | tr -d '\r\n')"

  if [[ "$exists" == "$DB_DATABASE_RESOLVED" ]]; then
    record pass DB-CREATE-001 "Target database already exists (${DB_DATABASE_RESOLVED})."
    return 0
  fi

  if MYSQL_PWD="$DB_PASSWORD_RESOLVED" mysql --protocol=TCP -h "$DB_HOST_RESOLVED" -P "$DB_PORT_RESOLVED" -u "$DB_USER_RESOLVED" --connect-timeout=5 -e "CREATE DATABASE IF NOT EXISTS ${db_identifier};" >/dev/null 2>&1; then
    record pass DB-CREATE-001 "Created target database (${DB_DATABASE_RESOLVED})."
    return 0
  fi

  record fail DB-CREATE-001 "Failed to create target database (${DB_DATABASE_RESOLVED})." "Check DB_USER permissions (CREATE DATABASE) or create database manually, then retry."
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
printf 'install_method: %s\n' "$INSTALL_METHOD"

DB_DIALECT_ENV="$(dotenv_value "DB_DIALECT")"
DB_HOST_ENV="$(dotenv_value "DB_HOST")"
DB_PORT_ENV="$(dotenv_value "DB_PORT")"
DB_DATABASE_ENV="$(dotenv_value "DB_DATABASE")"
DB_USER_ENV="$(dotenv_value "DB_USER")"
DB_PASSWORD_ENV="$(dotenv_value "DB_PASSWORD")"

DB_DIALECT_RESOLVED="${DB_DIALECT_INPUT:-$DB_DIALECT_ENV}"
if [[ -z "$DB_DIALECT_RESOLVED" ]]; then
  DB_DIALECT_RESOLVED='postgres'
fi
if [[ "$DB_DIALECT_RESOLVED" != "postgres" && "$DB_DIALECT_RESOLVED" != "mysql" && "$DB_DIALECT_RESOLVED" != "mariadb" ]]; then
  record fail INPUT-003 "Unsupported DB_DIALECT '${DB_DIALECT_RESOLVED}'." "Use DB_DIALECT=postgres, DB_DIALECT=mysql, or DB_DIALECT=mariadb."
fi
DB_HOST_RESOLVED="${DB_HOST_INPUT:-$DB_HOST_ENV}"
DB_PORT_RESOLVED="${DB_PORT_INPUT:-$DB_PORT_ENV}"
DB_DATABASE_RESOLVED="${DB_DATABASE_INPUT:-$DB_DATABASE_ENV}"
DB_USER_RESOLVED="${DB_USER_INPUT:-$DB_USER_ENV}"
DB_PASSWORD_RESOLVED="${DB_PASSWORD_INPUT:-$DB_PASSWORD_ENV}"

DB_MODE_RESOLVED="$DB_MODE"
if is_method_create_or_git; then
  DB_MODE_RESOLVED='existing'
elif is_method_docker && [[ "$DB_MODE_RESOLVED" == "bundled" ]] && has_external_db_inputs; then
  DB_MODE_RESOLVED='existing'
fi
DB_DATABASE_MODE_RESOLVED="$DB_DATABASE_MODE_INPUT"

if [[ -z "$DB_PORT_RESOLVED" ]]; then
  if [[ "$DB_DIALECT_RESOLVED" == "postgres" ]]; then
    DB_PORT_RESOLVED='5432'
  else
    DB_PORT_RESOLVED='3306'
  fi
fi

printf 'db_mode: %s\n' "$DB_MODE_RESOLVED"
printf 'db_dialect: %s\n' "$DB_DIALECT_RESOLVED"
printf 'db_database_mode: %s\n' "$DB_DATABASE_MODE_RESOLVED"
if [[ -n "$DB_HOST_RESOLVED" ]]; then
  printf 'db_host: %s\n' "$DB_HOST_RESOLVED"
fi

if has_cmd docker; then
  if docker --version >/dev/null 2>&1; then
    record pass DEP-DOCKER-001 "Docker detected."
  else
    if is_method_docker; then
      record fail DEP-DOCKER-001 "Docker command exists but version check failed." "Reinstall Docker."
    else
      record warn DEP-DOCKER-001 "Docker command exists but version check failed (optional for method=${INSTALL_METHOD})." "Reinstall Docker if you plan to use docker method."
    fi
  fi

  if docker info >/dev/null 2>&1; then
    record pass DEP-DOCKER-002 "Docker daemon is reachable."
  else
    if is_method_docker; then
      record fail DEP-DOCKER-002 "Docker daemon is not reachable." "Start Docker service."
    else
      record warn DEP-DOCKER-002 "Docker daemon is not reachable (optional for method=${INSTALL_METHOD})." "Start Docker service if you plan to use docker method."
    fi
  fi

  if docker compose version >/dev/null 2>&1; then
    record pass DEP-DOCKER-003 "Docker Compose detected."
  else
    if is_method_docker; then
      record fail DEP-DOCKER-003 "Docker Compose check failed." "Install Compose v2."
    else
      record warn DEP-DOCKER-003 "Docker Compose check failed (optional for method=${INSTALL_METHOD})." "Install Compose v2 if you plan to use docker method."
    fi
  fi
else
  if is_method_docker; then
    record fail DEP-DOCKER-001 "Docker not detected." "Install from https://docs.docker.com/get-started/get-docker/"
  else
    record warn DEP-DOCKER-001 "Docker not detected (optional for method=${INSTALL_METHOD})." "Install Docker only if docker method is needed."
  fi
fi

if has_cmd node; then
  NODE_VERSION="$(node -v 2>/dev/null || true)"
  NODE_MAJOR="$(printf '%s' "$NODE_VERSION" | sed -E 's/^v([0-9]+).*/\1/' 2>/dev/null)"
  if [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] && [[ "$NODE_MAJOR" -ge 20 ]]; then
    record pass DEP-NODE-001 "Node.js version is compatible ($NODE_VERSION)."
  else
    if is_method_create_or_git; then
      record fail DEP-NODE-001 "Node.js is below required version 20 for method=${INSTALL_METHOD} ($NODE_VERSION)." "Install Node.js >= 20."
    else
      record warn DEP-NODE-001 "Node.js is below recommended version 20 ($NODE_VERSION)." "Install Node.js >= 20."
    fi
  fi
else
  if is_method_create_or_git; then
    record fail DEP-NODE-001 "Node.js not detected (required for method=${INSTALL_METHOD})." "Install Node.js >= 20 from https://nodejs.org/en/download"
  else
    record warn DEP-NODE-001 "Node.js not detected." "Install Node.js >= 20 from https://nodejs.org/en/download"
  fi
fi

if has_cmd yarn; then
  YARN_VERSION="$(yarn -v 2>/dev/null || true)"
  if [[ "$YARN_VERSION" =~ ^1\.22\. ]]; then
    record pass DEP-YARN-001 "Yarn classic detected ($YARN_VERSION)."
  else
    if is_method_create_or_git; then
      record fail DEP-YARN-001 "Yarn is not 1.22.x (required for method=${INSTALL_METHOD}, current=$YARN_VERSION)." "Install Yarn Classic from https://classic.yarnpkg.com/lang/en/docs/install/"
    else
      record warn DEP-YARN-001 "Yarn is not 1.22.x ($YARN_VERSION)." "Install Yarn Classic from https://classic.yarnpkg.com/lang/en/docs/install/"
    fi
  fi
else
  if is_method_create_or_git; then
    record fail DEP-YARN-001 "Yarn not detected (required for method=${INSTALL_METHOD})." "Install Yarn Classic from https://classic.yarnpkg.com/lang/en/docs/install/"
  else
    record warn DEP-YARN-001 "Yarn not detected." "Install Yarn Classic from https://classic.yarnpkg.com/lang/en/docs/install/"
  fi
fi

if has_cmd git; then
  record pass DEP-GIT-001 "Git detected."
else
  if is_method_git; then
    record fail DEP-GIT-001 "Git not detected (required for method=git)." "Install from https://git-scm.com/install"
  else
    record warn DEP-GIT-001 "Git not detected." "Install from https://git-scm.com/install"
  fi
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

if [[ "$DB_MODE_RESOLVED" == "existing" ]]; then
  if [[ "$DB_DIALECT_RESOLVED" == "postgres" || "$DB_DIALECT_RESOLVED" == "mysql" || "$DB_DIALECT_RESOLVED" == "mariadb" ]]; then
    record pass DB-REQ-001 "External DB dialect is supported (${DB_DIALECT_RESOLVED})."
  else
    record fail DB-REQ-001 "External DB mode requires db_dialect=postgres|mysql|mariadb (current=${DB_DIALECT_RESOLVED})." "Set DB_DIALECT to postgres, mysql, or mariadb."
  fi

  missing_db_fields=()
  if [[ -z "$DB_HOST_RESOLVED" ]]; then missing_db_fields+=("DB_HOST"); fi
  if [[ -z "$DB_PORT_RESOLVED" ]]; then missing_db_fields+=("DB_PORT"); fi
  if [[ -z "$DB_DATABASE_RESOLVED" ]]; then missing_db_fields+=("DB_DATABASE"); fi
  if [[ -z "$DB_USER_RESOLVED" ]]; then missing_db_fields+=("DB_USER"); fi
  if [[ -z "$DB_PASSWORD_RESOLVED" ]]; then missing_db_fields+=("DB_PASSWORD"); fi

  if [[ "${#missing_db_fields[@]}" -gt 0 ]]; then
    record fail DB-REQ-002 "External DB mode is missing required fields: ${missing_db_fields[*]}." "Provide DB_* values or install PostgreSQL/MySQL/MariaDB first. PostgreSQL: ${POSTGRES_INSTALL_URL} | MySQL: ${MYSQL_INSTALL_URL} | MariaDB: ${MARIADB_INSTALL_URL}"
    emit_db_install_action
  else
    record pass DB-REQ-002 "External DB required fields are present."
    if [[ "$DB_PORT_RESOLVED" =~ ^[0-9]+$ ]]; then
      db_create_ready=1
      if tcp_reachable "$DB_HOST_RESOLVED" "$DB_PORT_RESOLVED"; then
        record pass DB-CONN-001 "Database endpoint is reachable (${DB_HOST_RESOLVED}:${DB_PORT_RESOLVED})."
      else
        tcp_rc=$?
        if [[ "$tcp_rc" == "2" ]]; then
          record fail DB-CONN-001 "Cannot verify database connectivity (${DB_HOST_RESOLVED}:${DB_PORT_RESOLVED}) because nc/timeout probing is unavailable." "Install PostgreSQL/MySQL/MariaDB client tools and retry. PostgreSQL: ${POSTGRES_INSTALL_URL} | MySQL: ${MYSQL_INSTALL_URL} | MariaDB: ${MARIADB_INSTALL_URL}"
        else
          record fail DB-CONN-001 "Database endpoint is not reachable (${DB_HOST_RESOLVED}:${DB_PORT_RESOLVED})." "Start database service or install one: PostgreSQL ${POSTGRES_INSTALL_URL} | MySQL ${MYSQL_INSTALL_URL} | MariaDB ${MARIADB_INSTALL_URL}"
        fi
        emit_db_install_action
        db_create_ready=0
      fi

      if [[ "$db_create_ready" == "1" ]] && ! ensure_db_created_if_requested; then
        db_create_ready=0
      fi

      if [[ "$db_create_ready" == "1" && "$DB_DIALECT_RESOLVED" == "postgres" ]]; then
        if has_cmd psql; then
          if PGPASSWORD="$DB_PASSWORD_RESOLVED" psql -h "$DB_HOST_RESOLVED" -p "$DB_PORT_RESOLVED" -U "$DB_USER_RESOLVED" -d "$DB_DATABASE_RESOLVED" -c "select 1;" -tA >/dev/null 2>&1; then
            record pass DB-AUTH-001 "PostgreSQL auth probe succeeded."
          else
            record fail DB-AUTH-001 "PostgreSQL auth probe failed (host=${DB_HOST_RESOLVED}, db=${DB_DATABASE_RESOLVED}, user=${DB_USER_RESOLVED})." "Check DB_DATABASE/DB_USER/DB_PASSWORD and permissions."
          fi
        else
          record warn DB-AUTH-001 "psql client is not available; skipped PostgreSQL auth probe." "Install psql for stronger preflight verification."
        fi
      elif [[ "$db_create_ready" == "1" && ( "$DB_DIALECT_RESOLVED" == "mysql" || "$DB_DIALECT_RESOLVED" == "mariadb" ) ]]; then
        if has_cmd mysql; then
          if MYSQL_PWD="$DB_PASSWORD_RESOLVED" mysql --protocol=TCP -h "$DB_HOST_RESOLVED" -P "$DB_PORT_RESOLVED" -u "$DB_USER_RESOLVED" -D "$DB_DATABASE_RESOLVED" --connect-timeout=5 -e "SELECT 1;" >/dev/null 2>&1; then
            record pass DB-AUTH-001 "MySQL/MariaDB auth probe succeeded."
          else
            record fail DB-AUTH-001 "MySQL/MariaDB auth probe failed (host=${DB_HOST_RESOLVED}, db=${DB_DATABASE_RESOLVED}, user=${DB_USER_RESOLVED})." "Check DB_DATABASE/DB_USER/DB_PASSWORD and permissions."
          fi
        else
          record warn DB-AUTH-001 "mysql client is not available; skipped MySQL/MariaDB auth probe." "Install mysql client for stronger preflight verification."
        fi
      fi
    else
      record fail DB-REQ-003 "DB_PORT must be numeric (current=${DB_PORT_RESOLVED})." "Set DB_PORT to a valid numeric port."
    fi
  fi
else
  record pass DB-REQ-000 "Using bundled database mode."
fi

COMPOSE_FILE_PATH="$(compose_file_path)"
HAS_DB_DIALECT_IN_COMPOSE=0
if [[ -n "$COMPOSE_FILE_PATH" ]] && grep -E 'DB_DIALECT=' "$COMPOSE_FILE_PATH" >/dev/null 2>&1; then
  HAS_DB_DIALECT_IN_COMPOSE=1
fi

if [[ "$DB_MODE_RESOLVED" == "bundled" ]] && is_method_docker; then
  if [[ -n "$DB_DIALECT_ENV" ]]; then
    record pass ENV-001 ".env contains DB_DIALECT."
  elif [[ "$HAS_DB_DIALECT_IN_COMPOSE" == "1" ]]; then
    record pass ENV-001 "${COMPOSE_FILE_PATH} contains DB_DIALECT for Docker runtime."
  elif [[ -f .env ]]; then
    record warn ENV-001 ".env found but DB_DIALECT is missing, and compose file has no DB_DIALECT." "Set DB_DIALECT in .env or docker-compose app environment before start/upgrade."
  else
    record warn ENV-001 ".env not found and compose file has no DB_DIALECT." "Create .env with DB_DIALECT or add DB_DIALECT to docker-compose app environment before start/upgrade."
  fi
else
  record pass ENV-001 "External DB mode will use provided DB_* values (method=${INSTALL_METHOD})."
fi

APP_KEY_VALUE="$(dotenv_value "APP_KEY")"
if [[ -z "$APP_KEY_VALUE" ]]; then
  APP_KEY_VALUE="${APP_KEY:-}"
fi

HAS_PROJECT_MARKER=0
if [[ -f .env || -f package.json || -n "$COMPOSE_FILE_PATH" ]]; then
  HAS_PROJECT_MARKER=1
fi

if [[ -z "$APP_KEY_VALUE" ]]; then
  if [[ "$HAS_PROJECT_MARKER" == "1" ]]; then
    record fail ENV-APPKEY-001 "APP_KEY is missing for existing project files." "Generate and set APP_KEY (example: openssl rand -hex 32)."
  else
    record warn ENV-APPKEY-001 "APP_KEY is not set yet; check deferred to local install script generation stage."
  fi
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
