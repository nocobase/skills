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

Skill routing rule:

- treat `nb init --ui` as the only install entrypoint

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
