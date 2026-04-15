# App Environment Manage

## Goal

Provide a single CLI wrapper path for app environment operations used by downstream skills:

- add environment
- switch current environment
- read current environment context
- list all configured environments

Use skill-local script:

- `node ./scripts/env-manage.mjs <action> ...`

## Command Contract

### 1) Add environment

```bash
node ./scripts/env-manage.mjs add --name <env_name> --url <app_url_or_api_url> --scope project --base-dir <target_dir>
```

Manual token input (typically remote env only):

```bash
node ./scripts/env-manage.mjs add --name <env_name> --url <app_url_or_api_url> --token <token> --scope project --base-dir <target_dir>
```

Or read manual token from env:

```bash
node ./scripts/env-manage.mjs add --name <env_name> --url <app_url_or_api_url> --token-env NOCOBASE_API_TOKEN --scope project --base-dir <target_dir>
```

### 2) Switch environment

```bash
node ./scripts/env-manage.mjs use --name <env_name> --scope project --base-dir <target_dir>
```

### 3) Current environment

```bash
node ./scripts/env-manage.mjs current --scope project --base-dir <target_dir>
```

### 4) List environments

```bash
node ./scripts/env-manage.mjs list --scope project --base-dir <target_dir>
```

## Local vs Remote Token Policy

Token requirement is decided by URL host:

- local hosts (token mandatory, auto-acquired by env-manage):
  - `localhost`
  - `127.0.0.1`
  - `::1`
  - any host ending with `.localhost`
  - `host.docker.internal`
- remote hosts (token manual and required):
  - any other host

Rules:

- Local add must auto-acquire a usable non-placeholder token from local context.
- Remote add must receive manual token (`--token` or `--token-env`).
- `add` always performs `env update` connectivity verification.
- For local add, if token/runtime dependency is missing, env-manage auto-attempts:
  - enable `@nocobase/plugin-api-doc` and `@nocobase/plugin-api-keys` via local plugin CLI paths
  - best-effort app restart
  - token re-acquire + `env add`/`env update` retry
- If `env update` fails, `add` returns failure (no false success).

## URL Normalization

For add action:

- accept `http` or `https` URL only
- normalize path to end with `/api`
- strip query string and hash

Examples:

- `http://localhost:13000` -> `http://localhost:13000/api`
- `https://demo.example.com` -> `https://demo.example.com/api`
- `https://demo.example.com/admin` -> `https://demo.example.com/admin/api`

## Output Shape

All actions return JSON.

Add example:

```json
{
  "ok": true,
  "action": "add",
  "env_name": "local",
  "base_url": "http://localhost:13000/api",
  "is_local": true,
  "token_mode": "auto-local-required",
  "scope": "project",
  "current_state": {
    "current_env_name": "local",
    "current_base_url": "http://localhost:13000/api"
  },
  "steps": {
    "add": { "exit_code": 0 },
    "use": { "exit_code": 0 },
    "env_update": { "exit_code": 0 }
  }
}
```

Current example:

```json
{
  "ok": true,
  "action": "current",
  "scope": "project",
  "current_env_name": "local",
  "current_base_url": "http://localhost:13000/api",
  "is_local": true,
  "available_envs": [
    {
      "name": "local",
      "base_url": "http://localhost:13000/api",
      "is_current": true
    }
  ]
}
```

## Failure Cases

1. Remote URL + missing token:
- fail with `ENV_TOKEN_REQUIRED_FOR_REMOTE`
- payload includes `action_required=provide_remote_api_token`
- payload includes `remote_token_guide` with:
  - plugin manager URL
  - API keys URL
  - 3-step manual guidance and rerun examples

2. Local URL + auto token acquisition failed:
- fail with `ENV_LOCAL_TOKEN_AUTO_ACQUIRE_FAILED`

3. Invalid URL:
- fail with `ENV_MANAGE_INVALID_INPUT`

4. Connectivity verification failed (`env update`):
- fail with `ENV_UPDATE_CONNECTIVITY_FAILED`
- payload includes `auto_dependency_recovery` for local auto-retry diagnostics
- when remote token is invalid/expired, payload includes:
  - `action_required=refresh_remote_api_token`
  - `remote_token_guide`

5. Underlying CLI/runtime failure:
- fail with `ENV_MANAGE_RUNTIME_ERROR`
