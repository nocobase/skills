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

# Scope

- Bootstrap or connect NocoBase environments through `nb init`.
- Manage saved CLI environments through `nb env`.
- Manage app runtime lifecycle through `nb app`.
- Inspect built-in database runtime only when it helps verify or diagnose the selected environment.

# Non-Goals

- Do not implement NocoBase business models, UI pages, workflows, or plugins.
- Do not run repository-local helper scripts for install or lifecycle work.
- Do not bypass the official install guide when the user provides an official install URL.

# Hard Rules

- Only run direct `nb` commands.
- Never run local scripts (`*.mjs`, `*.ps1`, `*.sh`).
- Never use template-driven install flows.
- For `task=install`, if the user provides an official NocoBase install or quick-start URL, read that URL first and follow the official guide flow. Ignore local install command tables when they conflict with the official guide.
- For `task=install`, use `nb init --ui` as the guided install entrypoint unless the current official guide says otherwise.
- `nb init --ui` is not a completion condition. Keep following CLI output until setup reaches a finished state or the CLI exits with an actionable failure.
- When executing `nb init --ui`, use a CLI timeout of 30 minutes and do not interrupt the command before it exits.
- If install flow exposes a URL that cannot be opened because the agent is running in a sandboxed environment, explicitly ask to elevate/open outside the sandbox; if the user refuses, provide the URL directly to the user.
- Never proactively fill install/setup forms on the user's behalf; only surface the URL, explain the next step, and let the user complete the form.
- If the CLI prints a continuation or recovery command, especially `nb init ... --resume ...`, execute that exact direct `nb` command unless it is destructive or conflicts with the user's latest instruction.
- Use `nb app <command>` for runtime lifecycle operations.
- Do not add extra precheck gates before executing user-requested `nb` commands.
- Prefer executing user-requested runtime commands first; use `nb --help` when user asks for diagnostics/help output or command discovery is needed.
- Surface CLI outputs and hints directly to users.

# Supported Tasks

- `install`
- `app-manage`
- `upgrade`
- `stop`
- `start`
- `restart`
- `logs`
- `down`

# Input Contract

| Input | Required | Default | Notes |
|---|---|---|---|
| `task` | yes | inferred | one of `install/app-manage/upgrade/start/stop/restart/logs/down` |
| `app_env_action` | for `task=app-manage` | `list` | one of `add/use/current/list/remove`; `current` is derived from list output |
| `app_env_name` | conditional | none | required for `add/use/remove` |
| `app_base_url` | conditional | none | required for `add`; accepts URL with or without `/api` (auto-normalized) |
| `cli_auth_mode` | for env add | `oauth` | one of `oauth/token` |
| `app_token` | conditional | none | required when `cli_auth_mode=token` |
| `runtime_env_name` | optional for `upgrade/start/stop/restart/logs/down` | current env | explicit runtime env name |

# Execution Policy

- Execute the target `nb` command directly.
- Install routing:
  - when the user provides an official NocoBase install or quick-start URL, read it first and follow that official flow, ignoring local install command tables on conflict
  - otherwise use `nb init --ui` as the guided install entrypoint
- For `task=install`, treat `nb init --ui` as a long-running interactive command:
  - set command timeout to 30 minutes
  - do not interrupt/wait-short/poll in a way that aborts the CLI before completion
  - do not stop just because a local setup URL was printed
  - continue until the CLI reports readiness, workspace completion, or an explicit failure
- If `nb init --ui` prints a local URL and browser open fails in sandbox, first ask to elevate/open outside sandbox; if that is declined, surface the URL so the user can open it manually.
- During install/setup flows, never submit or fill web forms for the user; provide instructions only.
- If install fails and CLI prints a resume command, run the printed `nb init ... --resume ...` command next. Do not rerun a fresh setup unless the CLI asks for it or the user explicitly requests it.
- Do not run separate preflight checks unless the user explicitly asks for diagnostics.
- If command fails, return key CLI output lines and suggested next commands from CLI output.
- For environment query intents (`list/current`), use fast path:
  - first command: `nb env list`
  - current env is the row marked with leading `*`
- For environment query intents, keep command set minimal:
  - `nb env --help` / `nb env list --help` are available when command discovery is needed.
- For environment details and post-install verification, prefer `nb env info [name]` and inspect app/database/API status.
- For `env add`, normalize API base URL before execution:
  - if URL already ends with `/api`, keep as-is
  - otherwise append `/api`

# Env Resolution Rule

For `upgrade/start/stop/restart/logs/down`:

1. If `runtime_env_name` is provided, pass `--env <env>`.
2. If no env is provided, run command without `--env` and follow CLI response.
3. If CLI reports no env configured, surface that message and ask user whether to create a new app or add an env.

# Workflow

1. Infer the requested task and any explicit env name, API base URL, auth mode, or official install URL.
2. For install requests with an official URL, read the URL first and follow the official guide flow.
3. Execute only direct `nb` commands from the current command map or from CLI-provided continuation hints.
4. Keep interactive install commands alive until completion, actionable failure, or user interruption.
5. Verify with `nb env list`, `nb env info`, and app/database status when relevant.
6. Report executed commands, important CLI output, and the next concrete action.

# Command Map

## install

```bash
nb init --ui
nb env list
nb env info
```

Install is done only when the CLI reports readiness/completion, such as `NocoBase is ready ...` and `Workspace init finished`, or equivalent success output from the current official guide.

## app-manage

### list/current

```bash
nb env list
nb env info [name]
```

For `current`, derive from the row marked with leading `*` in `nb env list` output. Do not call `nb env current`.

When CLI returns:

- `No envs configured.`
- `Run 'nb env add <name> --api-base-url <url>' to add one.`

surface this message directly and ask whether to create a new app (`nb init --ui`) or add env.

### add (oauth)

```bash
nb env add <name> --api-base-url <url> --auth-type oauth
```

`<url>` uses normalized value (auto-append `/api` when missing).

### add (token)

```bash
nb env add <name> --api-base-url <url> --auth-type token --access-token <token>
```

`<url>` uses normalized value (auto-append `/api` when missing).

### use

```bash
nb env use <name>
```

### remove

```bash
nb env remove <name>
```

Write actions (`add/use/remove`) must always be followed by:

```bash
nb env list
```

Use `nb env remove <name> -f` only after explicit user confirmation.

### auth

```bash
nb env auth [name]
```

## upgrade

```bash
nb app upgrade [--env <env>]
```

Optional:

```bash
nb app upgrade [--env <env>] --skip-code-update
```

## stop

```bash
nb app stop [--env <env>]
```

## start

```bash
nb app start [--env <env>]
```

Optional:

```bash
nb app start --env <env> --quickstart
nb app start --env <env> --port <port>
nb app start --env <env> --daemon
nb app start --env <env> --no-daemon
```

## restart

```bash
nb app restart [--env <env>]
```

## logs

```bash
nb app logs [--env <env>] [--tail <lines>] [--no-follow]
```

## down

```bash
nb app down [--env <env>]
```

# Safety

- Never run `upgrade` on ambiguous env.
- Ask explicit confirmation before `upgrade` when user intent is not explicit.
- Treat `nb app down` as destructive because it removes runtime containers and saved local app files. Always ask explicit confirmation before running it.
- Never pass `--all` or `--yes` to `nb app down` unless the user explicitly requests those flags.

Confirmation template:

- `Confirm execution: nb app upgrade --env <env>. Reply confirm to continue.`

# Safety Gate

Require explicit user confirmation before:

- `nb app upgrade` when the target env is ambiguous or the user did not clearly request an upgrade.
- `nb app down` in all cases.
- `nb env remove <name> -f`.
- Any command that includes `--all`, `--yes`, or force-style deletion flags.

# Output Contract

Final response must include:

- selected task
- executed commands
- relevant CLI outputs (including error/hint lines when failed)
- normalized API base URL (for `env add`)
- next action

# Reference Loading Map

| Reference | Use When |
|---|---|
| [Usage Guide](references/usage-guide.md) | Mapping user intent to current `nb` commands. |
| [Install Runbook](references/install-runbook.md) | Executing install/bootstrap flows, especially official URL and resume handling. |
| [Upgrade Runbook](references/upgrade-runbook.md) | Upgrading app runtimes with `nb app upgrade`. |
| [Preflight Checklist](references/preflight-checklist.md) | Optional diagnostics when explicitly requested. |
| [Troubleshooting](references/troubleshooting.md) | Recovering from CLI errors and version mismatch symptoms. |

# Verification Checklist

- Install requests with an official URL read and followed that URL first.
- `nb init --ui` was not treated as complete when only a setup URL appeared.
- Any CLI-provided `nb init ... --resume ...` continuation was followed or surfaced with a blocker.
- Runtime lifecycle commands used `nb app ...`.
- Env operations used the final `nb env` syntax.
- Final readback used `nb env list` and, when relevant, `nb env info`.

# References

- [Usage Guide](references/usage-guide.md)
- [Install Runbook](references/install-runbook.md)
- [Upgrade Runbook](references/upgrade-runbook.md)
- [Preflight Checklist](references/preflight-checklist.md)
- [Troubleshooting](references/troubleshooting.md)
