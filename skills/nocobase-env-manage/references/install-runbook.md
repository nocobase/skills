# Install Runbook

## Goal

Install/bootstrap NocoBase through `nb` CLI only.

## Mandatory Rule

Do not execute local scripts (`scripts/*.mjs`, `*.ps1`, `*.sh`).
- follow CLI-native checks and outputs directly

## Install Entrypoint

```bash
nb init --ui
```

This command launches the setup wizard and completes installation/bootstrap interactively.
Treat it as a long-running CLI task.

Skill routing rule:

- treat `nb init --ui` as the only install entrypoint
- run it with a 30 minute timeout budget
- once started, do not interrupt it before the command exits
- do not fill, submit, or complete install/setup forms on behalf of the user

## Browser/Open URL Handling

When `nb init --ui` prints a URL or attempts to open a browser:

- if the agent is sandboxed and cannot open the URL/browser, explicitly prompt to elevate/open outside the sandbox
- if the user refuses elevation, provide the URL directly and tell the user to open it manually
- even when the URL is reachable, let the user complete the browser form themselves
- do not replace `nb init --ui` with any local script or alternate install path

## Post-Install Readback

```bash
nb env list -s project
```

Expected:

- at least one env exists, or
- user can immediately run `nb env add ...`.

## Environment Add After Install (Common)

`app_base_url` can be provided with or without `/api`. For execution, use normalized `/api` URL.

```bash
# oauth mode
nb env add local --scope project --api-base-url http://localhost:13000/api --auth-type oauth

# token mode
nb env add local --scope project --api-base-url http://localhost:13000/api --auth-type token --access-token <token>

nb env list -s project
```

Example normalization:

```bash
# user input
app_base_url=http://localhost:13000

# executed command
nb env add local --scope project --api-base-url http://localhost:13000/api --auth-type oauth
```

## Done Criteria

- `nb init --ui` completed.
- `nb env list -s project` command runs successfully.
- if env was added, readback includes expected env row.
