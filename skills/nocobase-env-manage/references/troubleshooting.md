# Troubleshooting

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

## 3) `upgrade/start/stop` fails because env is missing

Symptom:

- no current env in `nb env list -s project`

Fix:

```bash
# user input can be `http://localhost:13000` or `http://localhost:13000/api`
nb env add local --scope project --api-base-url http://localhost:13000/api --auth-type oauth
# or
nb env use <name> -s project

nb env list -s project
```

## 4) `nb init --ui` cannot open browser

Fix:

- if the agent is sandboxed, ask to elevate/open outside the sandbox first
- if the user does not allow elevation, provide the URL emitted by `nb init --ui` and ask the user to open it manually
- if needed, rerun `nb init --ui`

## 5) `nb init --ui` appears slow or long-running

Fix:

- treat `nb init --ui` as a long-running interactive command
- allow up to 30 minutes for the CLI to complete
- once the command starts, do not interrupt it before it exits

## 6) Token mode env add fails

Symptom:

- `nb env add ... --auth-type token` rejected

Fix:

- ensure a valid token is provided with `--access-token`
- retry and verify with:

```bash
nb env list -s project
```

## 7) Wrong env targeted for runtime command

Fix:

```bash
nb env list -s project
nb env use <correct_env> -s project
nb env list -s project
```

Then rerun:

```bash
nb upgrade -e <correct_env>
# or
nb stop -e <correct_env>
nb start -e <correct_env>
```
