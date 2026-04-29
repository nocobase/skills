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
- [9) CLI self check or update fails](#9-cli-self-check-or-update-fails)
- [10) Skills check or update fails](#10-skills-check-or-update-fails)
- [11) Generic check or update intent is ambiguous](#11-generic-check-or-update-intent-is-ambiguous)

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

## 9) CLI self check or update fails

Symptom:

- `nb self check --json` reports an unhealthy CLI, version mismatch, or update availability
- `nb self update --yes` fails or asks for a shell/session restart

Fix:

```bash
nb self check --json
nb self update --yes
nb self check --json
```

If the update command says a new shell/session is required, stop after surfacing that message and ask the user to restart the shell or agent session before rechecking. Do not replace the command with `npm`, `pnpm`, or `yarn` update flows.

## 10) Skills check or update fails

Symptom:

- `nb skills check --json` reports missing, stale, or invalid installed skills
- `nb skills update --yes` fails or asks for a shell/session restart

Fix:

```bash
nb skills check --json
nb skills update --yes
nb skills check --json
```

If the update command prints repair instructions, surface them directly. Do not edit installed skill files manually unless the user explicitly asks for local skill development.

## 11) Generic check or update intent is ambiguous

Symptom:

- user says `检查状态`, `健康检查`, `诊断`, `检查更新`, `升级`, or `更新`
- user does not name app/runtime/env, CLI, or skills

Fix:

Ask before executing:

```text
你想检查/更新哪一类：NocoBase app/runtime/env、nb CLI，还是已安装 skills？
```

Then run only the clarified command family:

```bash
nb env list
nb env info
nb app upgrade [--env <env>]
nb self check --json
nb self update --yes
nb skills check --json
nb skills update --yes
```
