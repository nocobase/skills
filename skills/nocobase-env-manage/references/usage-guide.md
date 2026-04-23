# NocoBase Env Manage Usage Guide

## What This Skill Does

`nocobase-env-manage` is CLI-first and script-free. It provides:

- environment status query: `nb env list`
- environment add/switch/remove: `nb env add/use/remove`
- install bootstrap: `nb init --ui`
- app runtime lifecycle: `nb upgrade`, `nb stop`, `nb start`

## Core Rule

Do not run local scripts from this skill (`scripts/*.mjs`, `*.ps1`, `*.sh`).
- for install intent, always use `nb init --ui` as entrypoint
- run requested `nb` command directly and follow CLI output
- for `env add`, `app_base_url` may be provided with or without `/api`; execution command normalizes to `/api`
- for env query (`list/current`), run fast path first; use `nb env --help` / `nb env list --help` when command discovery is needed
- `nb env current` and `nb env list --json` may be unavailable in some CLI builds

## Quick Command Map

```bash
# env list
nb env list -s project

# env add (oauth)
nb env add local --scope project --api-base-url http://localhost:13000/api --auth-type oauth

# env add (token)
nb env add local --scope project --api-base-url http://localhost:13000/api --auth-type token --access-token <token>

# install
nb init --ui

# upgrade / stop / start
nb upgrade -e local
nb stop -e local
nb start -e local
```

## Fast Query Path

When user asks "what envs exist / current env":

1. Run `nb env list -s project`.
2. Only run `nb env list -s global` if user explicitly asks global/all scopes, or project scope is empty and user asks available envs.
3. Current env is the row prefixed by `*`; do not call `nb env current`.

## Current Env Resolution Rule

For `upgrade/start/stop` when env is not explicitly provided:

1. Run runtime command without `-e` when env is not explicitly provided.
2. If CLI reports no env configured, surface the message and ask user whether to create a new app (`nb init --ui`) or add env (`nb env add ...`).

## Typical Flows

### Install

```bash
nb init --ui
nb env list -s project
```

### Add env then use

```bash
# user input can be `https://demo.example.com` or `https://demo.example.com/api`
nb env add staging --scope project --api-base-url https://demo.example.com/api --auth-type oauth
nb env use staging -s project
nb env list -s project
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
nb env add local --scope project --api-base-url http://localhost:13000/api --auth-type oauth
```

### Upgrade current env

```bash
nb env list -s project
nb upgrade -e <resolved_current_env>
```

### Stop and start current env

```bash
nb env list -s project
nb stop -e <resolved_current_env>
nb start -e <resolved_current_env>
```

## Verification

After any write action (`env add/use/remove`), always run readback:

```bash
nb env list -s project
```
