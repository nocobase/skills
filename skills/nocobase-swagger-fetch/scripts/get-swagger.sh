#!/bin/bash
# Get Swagger documentation via nocobase-api-call skill
# Usage: ./get-swagger.sh <namespace>

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
API_CALL_SCRIPT="$SKILLS_DIR/nocobase-api-call/scripts/nocobase-api.sh"

RED='\033[0;31m'
NC='\033[0m'

usage() {
  echo "Usage: $0 <namespace>"
  echo "Example: $0 plugins%2Fdata-source-main"
  exit 1
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
fi

if [ "$#" -ne 1 ]; then
  echo -e "${RED}Error: namespace is required${NC}" >&2
  usage
fi

if [ ! -x "$API_CALL_SCRIPT" ]; then
  echo -e "${RED}Error: API caller script not found: $API_CALL_SCRIPT${NC}" >&2
  exit 1
fi

NAMESPACE="$1"
"$API_CALL_SCRIPT" --raw GET "/swagger:get?ns=${NAMESPACE}"
