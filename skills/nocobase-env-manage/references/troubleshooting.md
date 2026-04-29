# Troubleshooting

## Contents

- [1) `nb` command not found](#1-nb-command-not-found)
- [2) Missing `.nocobase` in workspace](#2-missing-nocobase-in-workspace)
- [3) `app upgrade/start/stop` fails because env is missing](#3-app-upgradestartstop-fails-because-env-is-missing)
- [4) `nb init --ui` cannot open browser](#4-nb-init---ui-cannot-open-browser)
- [5) `nb init --ui` appears slow or long-running](#5-nb-init---ui-appears-slow-or-long-running)
- [6) `nb init --ui` fails and prints `--resume`](#6-nb-init---ui-fails-and-prints--resume)
- [7) Token mode env add fails](#7-token-mode-env-add-fails)
- [8) Wrong env targeted for runtime command](#8-wrong-env-targeted-for-runtime-command)

## 1) `nb` command not found

Symptom:

- `nb --help` fails

Fix:

```bash
npm i -g @nocobase/cli
nb --help
```

## 2) Missing `.nocobase` in workspace

Symptom:

- current workspace has no `.nocobase/config.json`

Fix:

- this can be normal for first-time setup
- create a new app if needed:

```bash
nb init --ui
```

## 3) `app upgrade/start/stop` fails because env is missing

Symptom:

- no current env in `nb env list`

Fix:

```bash
# user input can be `http://localhost:13000` or `http://localhost:13000/api`
nb env add local --api-base-url http://localhost:13000/api --auth-type oauth
# or
nb env use <name>

nb env list
```

## 4) `nb init --ui` cannot open browser

Fix:

- if the agent is sandboxed, ask to elevate/open outside the sandbox first
- if the user does not allow elevation, provide the URL emitted by `nb init --ui` and ask the user to open it manually
- keep the CLI process running while the user completes the browser form
- do not declare install complete just because the setup URL was printed

## 5) `nb init --ui` appears slow or long-running

Fix:

- treat `nb init --ui` as a long-running interactive command
- allow up to 30 minutes for the CLI to complete
- once the command starts, do not interrupt it before it exits
- wait for ready/finished output such as `NocoBase is ready ...` and `Workspace init finished`

## 6) `nb init --ui` fails and prints `--resume`

Symptom:

- CLI exits before completion and prints a continuation command like `nb init --env local ... --resume --verbose`

Fix:

```bash
nb init --env <env> --resume
```

Use the exact command printed by the CLI, preserving source/version/registry/platform flags. Do not start a fresh setup unless the CLI asks for it or the user explicitly requests it.

## 7) Token mode env add fails

Symptom:

- `nb env add ... --auth-type token` rejected

Fix:

- ensure a valid token is provided with `--access-token`
- retry and verify with:

```bash
nb env list
```

## 8) Wrong env targeted for runtime command

Fix:

```bash
nb env list
nb env use <correct_env>
nb env list
```

Then rerun:

```bash
nb app upgrade --env <correct_env>
# or
nb app stop --env <correct_env>
nb app start --env <correct_env>
```
