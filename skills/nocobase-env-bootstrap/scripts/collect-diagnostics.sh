#!/usr/bin/env bash

set -u

OUTPUT_PATH="${1:-nocobase-diagnostics.txt}"
INCLUDE_DOCKER_LOGS="${INCLUDE_DOCKER_LOGS:-false}"
DOCKER_TAIL="${DOCKER_TAIL:-200}"

line() {
  printf '%s\n' "$1" >>"$OUTPUT_PATH"
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

safe_cmd() {
  local cmd="$1"
  local out
  out="$(eval "$cmd" 2>/dev/null | head -n 1 || true)"
  printf '%s' "$out"
}

safe_env_line() {
  local key="$1"
  local value
  value="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" .env 2>/dev/null | tail -n 1 || true)"
  if [[ -n "$value" ]]; then
    line "$value"
  fi
}

: >"$OUTPUT_PATH"

line "timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
line "cwd: $(pwd)"
line "os: $(uname -srm)"
line ""
line "== command versions =="

if has_cmd docker; then
  line "docker: $(safe_cmd "docker --version")"
else
  line "docker: <not found>"
fi

if has_cmd node; then
  line "node: $(safe_cmd "node -v")"
else
  line "node: <not found>"
fi

if has_cmd yarn; then
  line "yarn: $(safe_cmd "yarn -v")"
else
  line "yarn: <not found>"
fi

if has_cmd git; then
  line "git: $(safe_cmd "git --version")"
else
  line "git: <not found>"
fi

line ""
line "== selected env keys =="
if [[ -f .env ]]; then
  safe_env_line "APP_ENV"
  safe_env_line "APP_PORT"
  safe_env_line "DB_DIALECT"
  safe_env_line "DB_HOST"
  safe_env_line "DB_PORT"
  safe_env_line "DB_DATABASE"
  safe_env_line "NOCOBASE_RUNNING_IN_DOCKER"
else
  line ".env not found"
fi

if [[ "$INCLUDE_DOCKER_LOGS" == "true" ]] && has_cmd docker; then
  line ""
  line "== docker ps =="
  if docker ps --format "{{.Names}}|{{.Image}}|{{.Status}}" >>"$OUTPUT_PATH" 2>/dev/null; then
    :
  else
    line "<docker ps failed>"
  fi

  line ""
  line "== docker logs (tail=${DOCKER_TAIL}) =="
  mapfile -t containers < <(docker ps --format "{{.Names}}" 2>/dev/null | grep -Ei "nocobase|app" | head -n 3 || true)
  if [[ "${#containers[@]}" -eq 0 ]]; then
    line "<no matching containers>"
  else
    for name in "${containers[@]}"; do
      line ""
      line "-- ${name} --"
      docker logs --tail "$DOCKER_TAIL" --timestamps "$name" >>"$OUTPUT_PATH" 2>&1 || line "<docker logs failed for ${name}>"
    done
  fi
fi

printf 'Diagnostics written to: %s\n' "$OUTPUT_PATH"
