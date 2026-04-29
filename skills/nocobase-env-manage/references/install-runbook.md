# Install Runbook

## Contents

- [Goal](#goal)
- [Mandatory Rule](#mandatory-rule)
- [Install Entrypoint](#install-entrypoint)
- [Official URL Handling](#official-url-handling)
- [Browser/Open URL Handling](#browseropen-url-handling)
- [Continue/Resume Handling](#continueresume-handling)
- [Post-Install Readback](#post-install-readback)
- [Environment Add After Install (Common)](#environment-add-after-install-common)
- [API Base URL Normalization](#api-base-url-normalization)
- [Done Criteria](#done-criteria)

## Goal

Install/bootstrap NocoBase through `nb` CLI only.

## Mandatory Rule

Do not execute local scripts (`scripts/*.mjs`, `*.ps1`, `*.sh`).
- follow CLI-native checks and outputs directly
- when the user provides an official NocoBase install or quick-start URL, read that URL first and follow the official guide flow; ignore local install command tables when they conflict with the official guide

## Install Entrypoint

```bash
nb init --ui
```

This command launches the setup wizard and completes installation/bootstrap interactively.
Treat it as a long-running CLI task.

Skill routing rule:

- treat `nb init --ui` as the guided install entrypoint unless the current official guide says otherwise
- run it with a 30 minute timeout budget
- once started, do not interrupt it before the command exits
- do not stop after `nb init --ui` prints a local setup URL
- do not fill, submit, or complete install/setup forms on behalf of the user

## Official URL Handling

When the user includes an official NocoBase install or quick-start URL:

1. Open/read that URL before choosing commands.
2. Follow the official guide sequence as the source of truth for install.
3. Use local skill command maps only for current CLI syntax and safety handling; do not let local install commands override the official flow.
4. If the official guide and local skill disagree, prefer the official guide and report the mismatch.

## Browser/Open URL Handling

When `nb init --ui` prints a URL or attempts to open a browser:

- if the agent is sandboxed and cannot open the URL/browser, explicitly prompt to elevate/open outside the sandbox
- if the user refuses elevation, provide the URL directly and tell the user to open it manually
- even when the URL is reachable, let the user complete the browser form themselves
- keep the CLI command running while the user completes the form
- do not replace `nb init --ui` with any local script or alternate install path

## Continue/Resume Handling

If install exits with an actionable continuation command, follow it exactly.

Common example:

```bash
nb init --env <env> --source <source> --version <version> --resume --verbose
```

Rules:

- execute the printed direct `nb init ... --resume ...` command next
- do not rerun a fresh `nb init --ui` unless the CLI asks for it or the user explicitly requests it
- preserve the env name, source, version, registry, platform, and other flags printed by the CLI
- keep using a long timeout because resume may pull Docker images, install packages, or run health checks

## Post-Install Readback

```bash
nb env list
nb env info
```

Expected:

- at least one env exists, or
- user can immediately run `nb env add ...`.
- `nb env info` shows app/API/database details for the current env when install completed.

## Environment Add After Install (Common)

`app_base_url` can be provided with or without `/api`. For execution, use normalized `/api` URL.

```bash
# oauth mode
nb env add local --api-base-url http://localhost:13000/api --auth-type oauth

# token mode
nb env add local --api-base-url http://localhost:13000/api --auth-type token --access-token <token>

nb env list
```

Example normalization:

```bash
# user input
app_base_url=http://localhost:13000

# executed command
nb env add local --api-base-url http://localhost:13000/api --auth-type oauth
```

## Done Criteria

- The CLI reaches a ready/finished state, for example:
  - `NocoBase is ready at http://...`
  - `Workspace init finished.`
- `nb init --ui` or the required `nb init ... --resume ...` continuation command completed.
- `nb env list` command runs successfully.
- `nb env info` shows the selected env details; for local installs, app/database status should be inspectable.
- if env was added, readback includes expected env row.

Do not declare install complete merely because `nb init --ui` printed a setup URL or browser form.
