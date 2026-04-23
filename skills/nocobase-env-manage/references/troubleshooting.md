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

- rerun `nb init --ui`

## 5) Token mode env add fails

Symptom:

- `nb env add ... --auth-type token` rejected

Fix:

- ensure a valid token is provided with `--access-token`
- retry and verify with:

```bash
nb env list -s project
```

## 6) Wrong env targeted for runtime command

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
