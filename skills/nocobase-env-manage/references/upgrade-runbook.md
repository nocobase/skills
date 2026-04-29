# Upgrade Runbook

## Goal

Run app upgrade with direct `nb app` commands and explicit env resolution.

## Mandatory Rule

Do not execute local scripts (`scripts/*.mjs`, `*.ps1`, `*.sh`).
- run `nb` command directly and rely on CLI-native checks

## Step 1: Resolve env

Pick env by priority:

1. explicit user input (`runtime_env_name`)
2. otherwise run `nb app upgrade` without `--env` and follow CLI response
3. if CLI reports no env configured, ask user to create a new app (`nb init --ui`) or add env

## Step 2: Upgrade

```bash
nb app upgrade --env <env>
```

Optional:

```bash
nb app upgrade
nb app upgrade --env <env> --skip-code-update
nb app upgrade --env <env> -s
```

## Step 3: Verification

```bash
nb env list
nb env info <env>
```

Report:

- resolved env
- executed upgrade command
- readback result

## Safety

- Never run upgrade if env is ambiguous.
- Ask for explicit confirmation when user intent to upgrade is unclear.
