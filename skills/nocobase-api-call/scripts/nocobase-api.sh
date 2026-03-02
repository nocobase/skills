#!/bin/bash
# Generic NocoBase API caller
# Usage: ./nocobase-api.sh [--raw] <method> <endpoint> [data-file-or-json]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKDIR_ENV_FILE="${PWD}/.env"
PRESET_NOCOBASE_URL="${NOCOBASE_URL:-}"
PRESET_NOCOBASE_API_TOKEN="${NOCOBASE_API_TOKEN:-}"

load_env_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
    return 0
  fi
  return 1
}

write_default_env_file() {
  local env_file="$1"
  cat > "$env_file" <<'EOF'
NOCOBASE_URL=http://localhost:13000
NOCOBASE_API_TOKEN=replace-with-your-api-token
EOF
}

ACTIVE_ENV_FILE=""

# Load from files only when required values are missing from environment.
if [ -z "$PRESET_NOCOBASE_URL" ] || [ -z "$PRESET_NOCOBASE_API_TOKEN" ]; then
  if load_env_file "$WORKDIR_ENV_FILE"; then
    ACTIVE_ENV_FILE="$WORKDIR_ENV_FILE"
  fi
fi

NOCOBASE_URL="${PRESET_NOCOBASE_URL:-${NOCOBASE_URL:-http://localhost:13000}}"
API_TOKEN="${PRESET_NOCOBASE_API_TOKEN:-${NOCOBASE_API_TOKEN:-}}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

usage() {
  echo "Usage: $0 [--raw] <method> <endpoint> [data-file-or-json]"
  echo ""
  echo "Configuration:"
  echo "  1. Preferred: set NOCOBASE_URL / NOCOBASE_API_TOKEN as environment variables"
  echo "  2. Optional: create .env in current working directory with those keys"
  echo ""
  echo "Options:"
  echo "  --raw       Print response body only (no banners/status line)"
  echo ""
  echo "Arguments:"
  echo "  method      HTTP method (GET, POST, PUT, DELETE, PATCH)"
  echo "  endpoint    API endpoint (e.g., /collections:list)"
  echo "  data        Optional JSON string or path to JSON file"
  exit 1
}

if [ -z "$API_TOKEN" ]; then
  if [ ! -f "$WORKDIR_ENV_FILE" ]; then
    write_default_env_file "$WORKDIR_ENV_FILE"
    ACTIVE_ENV_FILE="$WORKDIR_ENV_FILE"
    echo -e "${YELLOW}Created config template:${NC} $WORKDIR_ENV_FILE"
    echo "Edit this file and set NOCOBASE_API_TOKEN, then retry."
    exit 1
  fi

  echo -e "${RED}Error: NOCOBASE_API_TOKEN not configured${NC}"
  echo ""
  echo "Set environment variable or create .env in current working directory:"
  echo "  NOCOBASE_URL=http://localhost:13000"
  echo "  NOCOBASE_API_TOKEN=<your-token>"
  [ -n "$ACTIVE_ENV_FILE" ] && echo "Loaded config file: $ACTIVE_ENV_FILE"
  exit 1
fi

RAW_OUTPUT=0
if [ "${1:-}" = "--raw" ]; then
  RAW_OUTPUT=1
  shift
fi

if [ $# -lt 2 ]; then
  usage
fi

METHOD="$1"
ENDPOINT="$2"
DATA="$3"

case "$METHOD" in
  GET|POST|PUT|DELETE|PATCH)
    ;;
  *)
    echo -e "${RED}Error: Invalid HTTP method '$METHOD'${NC}"
    echo "Allowed: GET, POST, PUT, DELETE, PATCH"
    exit 1
    ;;
esac

if [[ ! "$ENDPOINT" =~ ^/ ]]; then
  ENDPOINT="/$ENDPOINT"
fi

FULL_URL="${NOCOBASE_URL}/api${ENDPOINT}"

if [ "$RAW_OUTPUT" -eq 0 ]; then
  echo -e "${YELLOW}NocoBase API Call${NC}"
  echo "URL:    $FULL_URL"
  echo "Method: $METHOD"
fi

CURL_CMD=(curl -X "$METHOD" "$FULL_URL" -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" -s)

if [ -n "$DATA" ] && [[ "$METHOD" =~ ^(POST|PUT|PATCH)$ ]]; then
  if [ -f "$DATA" ]; then
    [ "$RAW_OUTPUT" -eq 0 ] && echo "Data:   @$DATA"
    CURL_CMD+=(-d "@$DATA")
  else
    [ "$RAW_OUTPUT" -eq 0 ] && echo "Data:   $DATA"
    CURL_CMD+=(-d "$DATA")
  fi
fi

if [ "$RAW_OUTPUT" -eq 1 ]; then
  "${CURL_CMD[@]}"
  exit 0
fi

CURL_CMD+=(-w "\n\n${GREEN}HTTP Status: %{http_code}${NC}\n")

echo ""
echo -e "${YELLOW}Response:${NC}"
"${CURL_CMD[@]}"
echo ""
