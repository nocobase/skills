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
node ./scripts/env-manage.mjs add --name <env_name> --url <app_url_or_api_url> --auth-mode oauth --scope project --base-dir <target_dir>
```

Manual token input (typically remote env only, token mode):

```bash
node ./scripts/env-manage.mjs add --name <env_name> --url <app_url_or_api_url> --auth-mode token --token <token> --scope project --base-dir <target_dir>
```

Or read manual token from env:

```bash
node ./scripts/env-manage.mjs add --name <env_name> --url <app_url_or_api_url> --auth-mode token --token-env NOCOBASE_API_TOKEN --scope project --base-dir <target_dir>
```

Compatibility rule:

- if `--token` or `--token-env` is provided without `--auth-mode`, `env-manage` auto-switches to `token` mode.

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

## Auth Mode Policy

Add action supports two auth modes:

- `oauth` (default)
- `token`

Rules:

- Default add mode is `oauth`.
- OAuth dependencies are `@nocobase/plugin-api-doc` + `@nocobase/plugin-idp-oauth`.
- OAuth add flow is: metadata probe -> `env add` -> `env use` -> `env auth` -> `env update`.
- If OAuth metadata probe fails on local URL, env-manage auto-attempts plugin enable and retry.
- OAuth login (`env auth`) requires interactive terminal.
- Token mode local/remote policy:
  - local hosts (`localhost`, `127.0.0.1`, `::1`, `*.localhost`, `host.docker.internal`): token mandatory and auto-acquired by env-manage.
  - remote hosts: manual token required (`--token` or `--token-env`).
- Token-mode dependency bundle is `@nocobase/plugin-api-doc` + `@nocobase/plugin-api-keys`.
- `add` always performs `env update` connectivity verification.
- For local add, if auth/runtime dependency is missing, env-manage auto-attempts plugin enable, best-effort restart, and retry.
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
  "auth_mode": "oauth",
  "auth_status": "oauth-authenticated",
  "token_mode": null,
  "scope": "project",
  "current_state": {
    "current_env_name": "local",
    "current_base_url": "http://localhost:13000/api"
  },
  "steps": {
    "add": { "exit_code": 0 },
    "use": { "exit_code": 0 },
    "env_auth": { "exit_code": 0 },
    "env_update": { "exit_code": 0 }
  }
}
```

Token-mode add output includes `auth_mode=token`, `auth_status=token-authenticated`, and token acquisition fields.

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

1. OAuth metadata endpoint unavailable:
- fail with `ENV_OAUTH_METADATA_UNAVAILABLE`
- payload includes `required_plugins` / `auto_dependency_recovery`
- for remote URL payload includes `remote_oauth_guide`

2. OAuth login requires interactive terminal:
- fail with `ENV_OAUTH_INTERACTIVE_REQUIRED`
- payload includes `action_required=complete_oauth_login` and `login_command`

3. Remote URL + missing token in token mode:
- fail with `ENV_TOKEN_REQUIRED_FOR_REMOTE`
- payload includes `action_required=provide_remote_api_token`
- payload includes `remote_token_guide` with:
  - plugin manager URL
  - API keys URL
  - 3-step manual guidance and rerun examples

4. Local URL + auto token acquisition failed in token mode:
- fail with `ENV_LOCAL_TOKEN_AUTO_ACQUIRE_FAILED`

5. Invalid URL:
- fail with `ENV_MANAGE_INVALID_INPUT`

6. Connectivity verification failed (`env update`):
- fail with `ENV_UPDATE_CONNECTIVITY_FAILED`
- payload includes `auto_dependency_recovery` for local auto-retry diagnostics
- when remote token is invalid/expired, payload includes:
  - `action_required=refresh_remote_api_token`
  - `remote_token_guide`

7. Underlying CLI/runtime failure:
- fail with `ENV_MANAGE_RUNTIME_ERROR`
