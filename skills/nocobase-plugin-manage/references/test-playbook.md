# Test Playbook

## Table of Contents

1. [Purpose](#purpose)
2. [Test Setup](#test-setup)
3. [Global Assertions](#global-assertions)
4. [Test Cases](#test-cases)
5. [Quick Regression Set](#quick-regression-set)

## Purpose

Provide copy-ready prompts for testing `nocobase-plugin-manage`.
Each case defines:

- prompt text
- intended task
- expected result

## Test Setup

Prepare placeholders before running cases:

- `<LOCAL_APP_PATH>`: local NocoBase app path, for example `E:/apps/my-nocobase`
- `<REMOTE_BASE_URL>`: remote app base URL, for example `https://demo.example.com`
- `<VALID_PLUGIN>`: plugin that exists in target app/plugin source
- `<NON_EXISTENT_PLUGIN>`: plugin name that does not exist
- `<TOKEN_ENV>`: environment variable name for remote token, for example `NOCOBASE_TOKEN_DEMO`
- `<COMPOSE_SERVICE>`: local docker compose app service name, default `app`

If testing remote write cases, make sure `<TOKEN_ENV>` is exported in the current shell.

## Global Assertions

All successful cases should include these output fields:

- `request`
- `channel`
- `execution_backend`
- `commands_or_actions`
- `verification`
- `assumptions`
- `target_resolution`
- `next_steps`

Write actions (`install`, `enable`, and `disable`) in `safe` mode should also include:

- `pre_state`
- `post_state`
- readback verification result (`passed` or `pending_verification`)

Failure cases caused by backend unavailability should include:

- `verification=failed`
- `fallback_hints`
- at least one UI fallback URL (`plugin-manager` and/or `api-keys`)

## Test Cases

### TC01 Local Inspect (Catalog)

Prompt:

```text
Use $nocobase-plugin-manage at E:/work/develop-skills/skills/nocobase-plugin-manage.
Run action=inspect with:
{
  "action": "inspect",
  "target": {
    "mode": "local",
    "app_path": "<LOCAL_APP_PATH>",
    "base_url": "http://127.0.0.1:13000"
  },
  "execution_mode": "safe",
  "verify": {
    "timeout_seconds": 90
  }
}
```

Task:

- Inspect local plugin catalog and status.

Expected:

- `channel=local`
- query path uses `pm:list` and optionally `pm:get`
- `verification=passed`
- output includes plugin entries with state fields (`enabled`/`installed`) when available

### TC02 Remote Inspect (Catalog)

Prompt:

```text
Use $nocobase-plugin-manage at E:/work/develop-skills/skills/nocobase-plugin-manage.
Run action=inspect with:
{
  "action": "inspect",
  "target": {
    "mode": "remote",
    "base_url": "<REMOTE_BASE_URL>"
  },
  "auth": {
    "token_env": "<TOKEN_ENV>"
  },
  "execution_mode": "safe"
}
```

Task:

- Inspect remote plugin catalog and enabled lanes.

Expected:

- `channel=remote`
- request routes include `pm:list` and/or `pm:listEnabled`
- `verification=passed`
- token value is not printed directly, only env var name appears

### TC03 Local Install (Happy Path)

Prompt:

```text
Use $nocobase-plugin-manage at E:/work/develop-skills/skills/nocobase-plugin-manage.
Run action=install with:
{
  "action": "install",
  "target": {
    "mode": "local",
    "app_path": "<LOCAL_APP_PATH>",
    "base_url": "http://127.0.0.1:13000"
  },
  "plugins": ["<VALID_PLUGIN>"],
  "execution_mode": "safe",
  "verify": {
    "timeout_seconds": 120
  }
}
```

Task:

- Install a plugin in local app using CLI.

Expected:

- `commands_or_actions` includes `yarn nocobase pm add`
- pre-state and post-state are both shown
- `verification=passed` or `pending_verification` (if async lag exceeds timeout)
- when passed, plugin is discoverable in post-state

### TC04 Remote Install (Custom Registry)

Prompt:

```text
Use $nocobase-plugin-manage at E:/work/develop-skills/skills/nocobase-plugin-manage.
Run action=install with:
{
  "action": "install",
  "target": {
    "mode": "remote",
    "base_url": "<REMOTE_BASE_URL>"
  },
  "auth": {
    "token_env": "<TOKEN_ENV>"
  },
  "plugins": ["<VALID_PLUGIN>"],
  "options": {
    "registry": "https://registry.npmjs.org",
    "version": "latest"
  },
  "execution_mode": "safe",
  "verify": {
    "timeout_seconds": 120
  }
}
```

Task:

- Install plugin on remote app through `pm:add`.

Expected:

- `channel=remote`
- action route includes `pm:add`
- result is not marked success before readback
- `verification=passed` or `pending_verification`

### TC05 Local Disable (Happy Path)

Prompt:

```text
Use $nocobase-plugin-manage at E:/work/develop-skills/skills/nocobase-plugin-manage.
Run action=disable with:
{
  "action": "disable",
  "target": {
    "mode": "local",
    "app_path": "<LOCAL_APP_PATH>",
    "base_url": "http://127.0.0.1:13000"
  },
  "plugins": ["<VALID_PLUGIN>"],
  "execution_mode": "safe",
  "verify": {
    "timeout_seconds": 120
  }
}
```

Task:

- Disable a plugin in local app.

Expected:

- `commands_or_actions` includes `yarn nocobase pm disable`
- post-state shows `enabled=false` for target plugin
- `verification=passed` or `pending_verification`

### TC06 Remote Disable (Happy Path)

Prompt:

```text
Use $nocobase-plugin-manage at E:/work/develop-skills/skills/nocobase-plugin-manage.
Run action=disable with:
{
  "action": "disable",
  "target": {
    "mode": "remote",
    "base_url": "<REMOTE_BASE_URL>"
  },
  "auth": {
    "token_env": "<TOKEN_ENV>"
  },
  "plugins": ["<VALID_PLUGIN>"],
  "execution_mode": "safe",
  "verify": {
    "timeout_seconds": 120
  }
}
```

Task:

- Disable plugin remotely through API action.

Expected:

- action route includes `pm:disable`
- post-state readback confirms `enabled=false`
- `verification=passed` or `pending_verification`

### TC07 Disable Non-Existent Plugin (Negative)

Prompt:

```text
Use $nocobase-plugin-manage at E:/work/develop-skills/skills/nocobase-plugin-manage.
Run action=disable with:
{
  "action": "disable",
  "target": {
    "mode": "local",
    "app_path": "<LOCAL_APP_PATH>",
    "base_url": "http://127.0.0.1:13000"
  },
  "plugins": ["<NON_EXISTENT_PLUGIN>"],
  "execution_mode": "safe"
}
```

Task:

- Validate not-found handling.

Expected:

- no false success
- `verification=failed`
- output explicitly says plugin not found or load error
- `next_steps` suggests checking name or running inspect first

### TC08 Remote Write Without Token (Negative)

Prompt:

```text
Use $nocobase-plugin-manage at E:/work/develop-skills/skills/nocobase-plugin-manage.
Run action=install with:
{
  "action": "install",
  "target": {
    "mode": "remote",
    "base_url": "<REMOTE_BASE_URL>"
  },
  "plugins": ["<VALID_PLUGIN>"],
  "execution_mode": "safe"
}
```

Task:

- Verify auth guard for remote mutation.

Expected:

- mutation is blocked before write
- response identifies missing token requirement
- `verification=failed`

### TC09 Unreachable Base URL In Safe Mode (Negative)

Prompt:

```text
Use $nocobase-plugin-manage at E:/work/develop-skills/skills/nocobase-plugin-manage.
Run action=inspect with:
{
  "action": "inspect",
  "target": {
    "mode": "remote",
    "base_url": "http://127.0.0.1:65530"
  },
  "execution_mode": "safe",
  "verify": {
    "timeout_seconds": 20
  }
}
```

Task:

- Verify reachability guard.

Expected:

- no mutation attempted
- clear connectivity error
- actionable recovery in `next_steps`

### TC10 Timeout Leads To Pending Verification

Prompt:

```text
Use $nocobase-plugin-manage at E:/work/develop-skills/skills/nocobase-plugin-manage.
Run action=disable with:
{
  "action": "disable",
  "target": {
    "mode": "remote",
    "base_url": "<REMOTE_BASE_URL>"
  },
  "auth": {
    "token_env": "<TOKEN_ENV>"
  },
  "plugins": ["<VALID_PLUGIN>"],
  "execution_mode": "safe",
  "verify": {
    "timeout_seconds": 10
  }
}
```

Task:

- Force tight timeout to validate pending status behavior.

Expected:

- write is triggered
- readback polling happens
- if timeout occurs, `verification=pending_verification`
- result includes last observed `post_state`

### TC11 Local Enable (Happy Path)

Prompt:

```text
Use $nocobase-plugin-manage at E:/work/develop-skills/skills/nocobase-plugin-manage.
Run action=enable with:
{
  "action": "enable",
  "target": {
    "mode": "local",
    "app_path": "<LOCAL_APP_PATH>",
    "base_url": "http://127.0.0.1:13000"
  },
  "plugins": ["<VALID_PLUGIN>"],
  "execution_mode": "safe",
  "verify": {
    "timeout_seconds": 120
  }
}
```

Task:

- Enable a plugin in local app.

Expected:

- `commands_or_actions` includes `yarn nocobase pm enable`
- post-state shows `enabled=true` for target plugin
- `verification=passed` or `pending_verification`

### TC12 Compact Invocation + Auto Target Resolution

Prompt:

```text
Use $nocobase-plugin-manage enable <VALID_PLUGIN>
```

Task:

- Validate compact invocation can auto-resolve local/remote target.

Expected:

- request is normalized into structured execution payload
- output includes `target_resolution` with explicit decision evidence
- `channel` is explicit (`local` or `remote`)
- `verification` is not reported as passed before readback

### TC13 Local Docker Backend Auto-Selection

Prompt:

```text
Use $nocobase-plugin-manage enable <VALID_PLUGIN>
Assume current workspace is a docker-compose based local NocoBase app.
```

Task:

- Validate backend auto-selection prefers docker CLI in local docker environments.

Expected:

- `channel=local`
- `execution_backend=docker_cli`
- `commands_or_actions` includes `docker compose exec -T app yarn nocobase pm enable`
- verification behavior remains readback-based (`passed` or `pending_verification`)

### TC14 All Backends Unavailable (Rich Guidance)

Prompt:

```text
Use $nocobase-plugin-manage enable @nocobase/plugin-mcp-server
Assume docker/host CLI are unavailable and remote API is unreachable.
```

Task:

- Validate failure output quality when no backend can be used.

Expected:

- `verification=failed`
- output includes `fallback_hints` with concrete manual actions
- fallback includes plugin manager URL and API keys URL templates
- next steps explicitly mention manual UI activation and retry path

## Quick Regression Set

Use this set for fast smoke checks:

1. TC01 local inspect
2. TC13 local docker backend auto-selection
3. TC03 local install
4. TC11 local enable
5. TC05 local disable
6. TC02 remote inspect
7. TC14 all backends unavailable guidance
