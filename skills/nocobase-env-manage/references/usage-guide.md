# NocoBase Env Manage Usage Guide

## Contents

- [What This Skill Does](#what-this-skill-does)
- [Core Rule](#core-rule)
- [Quick Command Map](#quick-command-map)
- [Fast Query Path](#fast-query-path)
- [Current Env Resolution Rule](#current-env-resolution-rule)
- [Typical Flows](#typical-flows)
- [API Base URL Normalization](#api-base-url-normalization)
- [Verification](#verification)

## What This Skill Does

`nocobase-env-manage` is CLI-first and script-free. It provides:

- environment status query: `nb env list`
- environment add/switch/remove: `nb env add/use/remove`
- install bootstrap: `nb init --ui`
- app runtime lifecycle: `nb app upgrade`, `nb app stop`, `nb app start`

## Core Rule

Do not run local scripts from this skill (`scripts/*.mjs`, `*.ps1`, `*.sh`).
- for install intent with an official NocoBase install or quick-start URL, read that URL first and follow the official guide flow; ignore local install command tables on conflict
- for install intent without an official URL, use `nb init --ui` as the guided entrypoint
- for `nb init --ui`, allow up to 30 minutes and do not interrupt the CLI before it exits
- do not stop after `nb init --ui` prints a local setup URL; keep the CLI running and follow its next output
- if the CLI prints a continuation command such as `nb init ... --resume ...`, execute that direct `nb` command next
- if a URL cannot be opened because the agent is sandboxed, ask to elevate/open outside sandbox first; if refused, give the URL to the user
- never proactively fill install/setup forms for the user
- run requested `nb` command directly and follow CLI output
- for `env add`, `app_base_url` may be provided with or without `/api`; execution command normalizes to `/api`
- for env query (`list/current`), run `nb env list`; use `nb env --help` / `nb env list --help` when command discovery is needed
- use `nb app <command>` for runtime lifecycle commands

## Quick Command Map

```bash
# env list
nb env list

# env details
nb env info

# env add (oauth)
nb env add local --api-base-url http://localhost:13000/api --auth-type oauth

# env add (token)
nb env add local --api-base-url http://localhost:13000/api --auth-type token --access-token <token>

# install
nb init --ui

# upgrade / stop / start / restart / logs
nb app upgrade --env local
nb app stop --env local
nb app start --env local
nb app restart --env local
nb app logs --env local --tail 100 --no-follow
```

## Fast Query Path

When user asks "what envs exist / current env":

1. Run `nb env list`.
2. Current env is the row prefixed by `*`; do not call `nb env current`.
3. Run `nb env info [name]` when details or verification are needed.

## Current Env Resolution Rule

For `upgrade/start/stop/restart/logs/down` when env is not explicitly provided:

1. Run runtime command without `--env` when env is not explicitly provided.
2. If CLI reports no env configured, surface the message and ask user whether to create a new app (`nb init --ui`) or add env (`nb env add ...`).

## Typical Flows

### Install

```bash
nb init --ui
nb env list
nb env info
```

Install notes:

- if the user provides an official NocoBase install URL, read the official guide first and follow it, ignoring local install command tables on conflict
- `nb init --ui` is the guided install entrypoint unless the current official guide says otherwise
- keep waiting for completion; do not abort the CLI during its 30 minute timeout window
- keep waiting after the local setup URL is printed; this URL is not completion
- if CLI prints `nb init ... --resume ...`, run that continuation command
- if browser open fails in sandbox, prompt for elevation first, otherwise share the URL with the user
- the user, not the agent, completes the install/setup form in the browser
- install is done only after ready/finished output such as `NocoBase is ready ...` and `Workspace init finished`

### Add env then use

```bash
# user input can be `https://demo.example.com` or `https://demo.example.com/api`
nb env add staging --api-base-url https://demo.example.com/api --auth-type oauth
nb env use staging
nb env list
```

## API Base URL Normalization

For `nb env add`:

1. If user provides `app_base_url` ending with `/api`, keep it.
2. If user provides `app_base_url` without `/api`, append `/api` before execution.

Example:

```bash
# user input
app_base_url=http://localhost:13000

# executed command
nb env add local --api-base-url http://localhost:13000/api --auth-type oauth
```

### Upgrade current env

```bash
nb env list
nb app upgrade --env <resolved_current_env>
```

### Stop and start current env

```bash
nb env list
nb app stop --env <resolved_current_env>
nb app start --env <resolved_current_env>
```

## Verification

After any write action (`env add/use/remove`), always run readback:

```bash
nb env list
```

For local runtime verification, run:

```bash
nb env info
```
