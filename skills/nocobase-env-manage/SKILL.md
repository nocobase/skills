---
name: nocobase-env-manage
description: "Use when users need NocoBase bootstrap and runtime lifecycle with nb CLI only."
argument-hint: "[task: install|app-manage|upgrade|start|stop]"
allowed-tools: Bash, Read, Write, Grep, Glob
owner: platform-tools
version: 2.5.1
last-reviewed: 2026-04-23
risk-level: medium
---

# Goal

Use `nb` CLI only to complete NocoBase bootstrap and lifecycle actions.

# Hard Rules

- Only run direct `nb` commands.
- Never run local scripts (`*.mjs`, `*.ps1`, `*.sh`).
- Never use template-driven install flows.
- For `task=install`, only execute `nb init --ui`.
- When executing `nb init --ui`, use a CLI timeout of 30 minutes and do not interrupt the command before it exits.
- If install flow exposes a URL that cannot be opened because the agent is running in a sandboxed environment, explicitly ask to elevate/open outside the sandbox; if the user refuses, provide the URL directly to the user.
- Never proactively fill install/setup forms on the user's behalf; only surface the URL, explain the next step, and let the user complete the form.
- Do not add extra precheck gates before executing user-requested `nb` commands.
- Prefer executing user-requested runtime commands first; use `nb --help` when user asks for diagnostics/help output or command discovery is needed.
- Surface CLI outputs and hints directly to users.

# Supported Tasks

- `install`
- `app-manage`
- `upgrade`
- `stop`
- `start`

# Input Contract

| Input | Required | Default | Notes |
|---|---|---|---|
| `task` | yes | inferred | one of `install/app-manage/upgrade/start/stop` |
| `app_env_action` | for `task=app-manage` | `list` | one of `add/use/current/list/remove`; `current` is derived from list output |
| `app_env_name` | conditional | none | required for `add/use/remove` |
| `app_base_url` | conditional | none | required for `add`; accepts URL with or without `/api` (auto-normalized) |
| `app_scope` | no | `project` | one of `project/global` |
| `cli_auth_mode` | for env add | `oauth` | one of `oauth/token` |
| `app_token` | conditional | none | required when `cli_auth_mode=token` |
| `runtime_env_name` | optional for `upgrade/start/stop` | current env | explicit runtime env name |

# Execution Policy

- Execute the target `nb` command directly.
- Install routing is fixed:
  - `task=install` -> `nb init --ui` only
- For `task=install`, treat `nb init --ui` as a long-running interactive command:
  - set command timeout to 30 minutes
  - do not interrupt/wait-short/poll in a way that aborts the CLI before completion
- If `nb init --ui` prints a local URL and browser open fails in sandbox, first ask to elevate/open outside sandbox; if that is declined, surface the URL so the user can open it manually.
- During install/setup flows, never submit or fill web forms for the user; provide instructions only.
- Do not run separate preflight checks unless the user explicitly asks for diagnostics.
- If command fails, return key CLI output lines and suggested next commands from CLI output.
- For environment query intents (`list/current`), use fast path:
  - first command: `nb env list -s project`
  - only run `nb env list -s global` when user explicitly asks global/all scopes, or when project scope is empty and user asks for available envs.
- For environment query intents, keep command set minimal and compatible:
  - `nb env --help` / `nb env list --help` are available when command discovery is needed.
  - `nb env current` and `nb env list --json` may be unavailable in some CLI builds.
- For `env add`, normalize API base URL before execution:
  - if URL already ends with `/api`, keep as-is
  - otherwise append `/api`

# Env Resolution Rule

For `upgrade/start/stop`:

1. If `runtime_env_name` is provided, pass `-e <env>`.
2. If no env is provided, run command without `-e` and follow CLI response.
3. If CLI reports no env configured, surface that message and ask user whether to create a new app or add an env.

# Command Map

## install

```bash
nb init --ui
nb env list -s project
```

## app-manage

### list/current

```bash
nb env list -s <project|global>
```

For `current`, derive from the row marked with leading `*` in `nb env list` output. Do not call `nb env current`.

When CLI returns:

- `No envs configured.`
- `Run 'nb env add <name> --base-url <url>' to add one.`

surface this message directly and ask whether to create a new app (`nb init --ui`) or add env.

### add (oauth)

```bash
nb env add <name> --scope <project|global> --api-base-url <url> --auth-type oauth
```

`<url>` uses normalized value (auto-append `/api` when missing).

### add (token)

```bash
nb env add <name> --scope <project|global> --api-base-url <url> --auth-type token --access-token <token>
```

`<url>` uses normalized value (auto-append `/api` when missing).

### use

```bash
nb env use <name> -s <project|global>
```

### remove

```bash
nb env remove <name> -s <project|global>
```

Write actions (`add/use/remove`) must always be followed by:

```bash
nb env list -s <project|global>
```

## upgrade

```bash
nb upgrade [-e <env>]
```

Optional:

```bash
nb upgrade [ -e <env> ] --skip-code-update
```

## stop

```bash
nb stop [-e <env>]
```

## start

```bash
nb start [-e <env>]
```

Optional:

```bash
nb start -e <env> --quickstart
nb start -e <env> --port <port>
nb start -e <env> --daemon
```

# Safety

- Never run `upgrade` on ambiguous env.
- Ask explicit confirmation before `upgrade` when user intent is not explicit.

Confirmation template:

- `Confirm execution: nb upgrade -e <env>. Reply confirm to continue.`

# Output Contract

Final response must include:

- selected task
- executed commands
- relevant CLI outputs (including error/hint lines when failed)
- normalized API base URL (for `env add`)
- next action

# References

- [Usage Guide](references/usage-guide.md)
- [Install Runbook](references/install-runbook.md)
- [Upgrade Runbook](references/upgrade-runbook.md)
- [Preflight Checklist](references/preflight-checklist.md)
- [Troubleshooting](references/troubleshooting.md)
