# Runtime Contract

## Contents

- [Goal](#goal)
- [Command Surface](#command-surface)
- [Publish Context](#publish-context)
- [Environment Capability Gate](#environment-capability-gate)
- [Publish Input Confirmation Gate](#publish-input-confirmation-gate)
- [Backup Workflow](#backup-workflow)
- [Migration Workflow](#migration-workflow)
- [Output Parsing](#output-parsing)
- [Failure Handling](#failure-handling)

## Goal

Execute NocoBase backup restore and migration workflows with API-generated CLI commands:

- `nb api backup ...`
- `nb api migration ...`
- `nb api migration rules ...`
- `nb api migration logs ...`

## Command Surface

Backup commands:

```bash
nb api backup list -e <env> --json-output
nb api backup create -e <sourceEnv> --json-output
nb api backup status --name <backupName> -e <env> --json-output
nb api backup download --name <backupName> --output <localFile> -e <sourceEnv>
nb api backup restore --name <backupName> -e <targetEnv> --json-output
nb api backup restore-upload --file <localFile> -e <targetEnv> --json-output
nb api backup restore-status --task <taskId> -e <targetEnv> --json-output
nb api backup remove --name <backupName> -e <env> --json-output
```

Migration commands:

```bash
nb api migration list -e <env> --json-output
nb api migration get --name <migrationName> -e <env> --json-output
nb api migration create --rule-id <ruleId> --title <title> -e <sourceEnv> --json-output
nb api migration download --name <migrationName> --output <localFile> -e <sourceEnv>
nb api migration check --file <localFile> -e <targetEnv> --json-output
nb api migration execute --file <localFile> -e <targetEnv> --json-output
nb api migration remove --name <migrationName> -e <env> --json-output
nb api migration rules list -e <sourceEnv> --json-output
nb api migration rules get --filter-by-tk <ruleId> -e <sourceEnv> --json-output
nb api migration rules create --name <name> --user-defined-rule <schema-only|overwrite> --system-defined-rule <overwrite-first|schema-only> -e <sourceEnv> --json-output
nb api migration logs list -e <targetEnv> --json-output
nb api migration logs get --name <logName> -e <targetEnv> --json-output
nb api migration logs download --name <logName> --output <localFile> -e <targetEnv>
```

Command rules:

- Use `--json-output` for JSON API results.
- Use `--output` for binary downloads.
- Use `--file` for multipart uploads.
- Use `-e <env>` or `--env <env>` explicitly on every command.
- Write downloaded release files to the CLI home release workspace: `<cliHome>/release/<sourceEnv>/<filename>`.

## Publish Context

Maintain this context throughout the workflow:

```json
{
  "method": "backup|migration",
  "sourceEnv": "dev",
  "targetEnv": "dev",
  "cliHome": "C:/Users/<user>/.nocobase",
  "releaseDir": "C:/Users/<user>/.nocobase/release/dev",
  "backupName": "optional backup file name",
  "migrationName": "optional migration file name",
  "localFile": "absolute or relative local package path",
  "downloadPath": "path passed to --output",
  "taskId": "optional backup restore task id",
  "ruleId": "optional migration rule id",
  "ruleName": "optional migration rule name",
  "title": "optional migration title",
  "step": "planned|created|downloaded|checked|executed|failed"
}
```

For tests, default to:

```json
{
  "sourceEnv": "dev",
  "targetEnv": "dev"
}
```

Use explicit context values when building each later command.

## Local Release Workspace

Resolve `cliHome` from the CLI home directory. In normal global mode this is the user's home plus `.nocobase`, for example `C:/Users/Enzo/.nocobase` on Windows. If the user or CLI environment uses another configured CLI root, use that root's `.nocobase` home.

For downloaded files, create and use this path shape:

```text
<cliHome>/release/<sourceEnv>/<filename>
```

Examples:

```text
C:/Users/Enzo/.nocobase/release/dev/backup_20260430_163137_3622.nbdata
C:/Users/Enzo/.nocobase/release/dev/migration_1777538194680.nbdata
```

Rules:

- Use the source environment in the release path because that environment produced or hosted the package.
- Keep the server filename unchanged.
- Pass the full release workspace path to `--output`, then reuse the same path for `restore-upload`, `migration check`, or `migration execute`.
- Do not store downloaded packages in the current working directory or temporary repo folders unless the user explicitly provides a different `--output` path.

## Environment Capability Gate

Before a workflow mutates any environment, verify that each participating environment supports the requested API surface.

Read-only probes:

```bash
nb api backup list -e <env> --json-output
nb api migration list -e <env> --json-output
nb api migration rules list -e <sourceEnv> --json-output
nb api migration logs list -e <targetEnv> --json-output
```

Rules:

- For backup restore, the source environment supports backup create/list/download when generating or copying a backup, and the target environment supports backup restore or restore-upload.
- For migration, the source environment supports migration rules and migration create/download when generating a package, and the target environment supports migration check/execute.
- HTTP 404, `Not Found`, unknown resource, missing adapter, missing plugin, inactive plugin, or license/commercial capability errors become `unsupported_publish_env`.
- Empty lists mean the API exists and currently has no available package.
- `unsupported_publish_env` stops the workflow at the capability gate.
- Report the environment, method, failed probe command, and likely cause.

## Publish Input Confirmation Gate

Before package creation, download, rule creation, or migration check, get explicit user confirmation for the selected input.

This gate applies before:

```bash
nb api backup create ...
nb api backup download ...
nb api migration rules create ...
nb api migration create ...
nb api migration download ...
nb api migration check ...
```

Rules:

- Show method, source environment, target environment, selected file or generation plan, and selected or new migration rule.
- Echo named files exactly before using them.
- Package lists lead to explicit user selection.
- Migration rule lists lead to explicit user selection or approved global rule creation.
- New global migration rule creation shows `user-defined-rule`, `system-defined-rule`, rule name, and source environment.
- Use a distinct confirmation phrase such as `confirm input` for this gate.
- Execution confirmation remains a separate gate for restore, execute, and remove actions.

## Backup Workflow

### Existing Local Backup File

Plan:

```bash
nb api backup restore-upload --file <localFile> -e <targetEnv> --json-output
```

Rules:

- Use the provided local file as the package source.
- Require execution confirmation before `restore-upload`.
- Use `--skip-revert-on-error` when the user explicitly requests it and the confirmation summary repeats it.

### Existing Server Backup In Same Environment

Plan:

```bash
nb api backup status --name <backupName> -e <targetEnv> --json-output
nb api backup restore --name <backupName> -e <targetEnv> --json-output
```

Rules:

- Use direct restore when the backup already exists on the target environment.
- Require execution confirmation before `restore`.
- If restore returns a task id, check `backup restore-status --task <taskId>` after restore starts or if the command returns an async state.

### Source-To-Target Backup Restore

Plan:

```bash
nb api backup create -e <sourceEnv> --json-output
nb api backup status --name <backupName> -e <sourceEnv> --json-output
nb api backup download --name <backupName> --output <localFile> -e <sourceEnv>
nb api backup restore-upload --file <localFile> -e <targetEnv> --json-output
```

Rules:

- User-selected source backups enter the workflow at `backup status`.
- Parse `backupName` from the create response before status/download.
- Always use `--output` for download, with `<localFile>` under `<cliHome>/release/<sourceEnv>/`.
- Cross-environment restore uses `restore-upload`.

## Migration Workflow

### Existing Local Migration File

Plan:

```bash
nb api migration check --file <localFile> -e <targetEnv> --json-output
nb api migration execute --file <localFile> -e <targetEnv> --json-output
```

Rules:

- Use the provided local file as the package source.
- Check the local file before execute.
- Require execution confirmation before execute.

### Existing Server Migration File

Plan:

```bash
nb api migration get --name <migrationName> -e <sourceEnv> --json-output
nb api migration download --name <migrationName> --output <localFile> -e <sourceEnv>
nb api migration check --file <localFile> -e <targetEnv> --json-output
nb api migration execute --file <localFile> -e <targetEnv> --json-output
```

Rules:

- Use the server file name from `migration list` or user input.
- Download to `<cliHome>/release/<sourceEnv>/<migrationName>` before target check/execute.
- Require input confirmation before download/check and execution confirmation before execute.

### Generate Migration From Rule

Plan:

```bash
nb api migration rules list -e <sourceEnv> --json-output
nb api migration rules get --filter-by-tk <ruleId> -e <sourceEnv> --json-output
nb api migration create --rule-id <ruleId> --title <title> -e <sourceEnv> --json-output
nb api migration get --name <migrationName> -e <sourceEnv> --json-output
nb api migration download --name <migrationName> --output <localFile> -e <sourceEnv>
nb api migration check --file <localFile> -e <targetEnv> --json-output
nb api migration execute --file <localFile> -e <targetEnv> --json-output
```

Global rule creation:

```bash
nb api migration rules create --name <ruleName> --user-defined-rule <schema-only|overwrite> --system-defined-rule <overwrite-first|schema-only> -e <sourceEnv> --json-output
```

Rules:

- Require `ruleId` before `migration create`.
- Discover unknown `ruleId` values with `migration rules list`.
- Global rule creation supports:
  - user-defined tables: `schema-only` or `overwrite`
  - system-defined tables: `overwrite-first` or `schema-only`
- Verify a selected or created rule with `migration rules get` when possible.
- Parse `migrationName` from the create response before download.
- Use the official `--rule-id` parameter.
- If `migration download` returns a transient 400/503 after `migration get` reports `status=ok`, rerun `migration get` once and retry the same download command once. If retry fails, stop at the download step.
- Apply the confirmation gate before rule creation, package creation, download, check, and execute steps.

## Output Parsing

Prefer JSON with `--json-output` for non-binary commands. Extract:

- backup file name from `backup create`
- backup status/state from `backup status` and `backup restore-status --task <taskId>`
- migration rule id from `migration rules create/list/get`
- migration file name from `migration create/list/get`
- migration check result from `migration check`
- execution state or error from `migration execute`
- log names from `migration logs list`

For binary commands, preserve the exact `--output` path:

- `backup download --output <cliHome>/release/<sourceEnv>/<backupName>`
- `migration download --output <cliHome>/release/<sourceEnv>/<migrationName>`
- `migration logs download --output <cliHome>/release/<targetEnv>/<logName>`

## Failure Handling

- Capability probe failure reports `unsupported_publish_env`.
- Backup create/status/download failure stops before restore.
- Backup restore failure inspects or suggests `backup restore-status --task <taskId>` when a task id was returned.
- Migration rule create failure stops before migration create.
- Migration create/download failure stops before check or execute. A transient migration download failure may be retried once after `migration get` confirms `status=ok`.
- Migration check failure stops before execute.
- Migration execute failure inspects or suggests `migration logs list/get/download`.
- Rule/package recreation after a failure requires explicit user instruction.
- Preserve the context values collected before the failure.
