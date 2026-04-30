# Test Playbook

## Contents

- [Goal](#goal)
- [Scenario 1: Local Backup Restore In One Environment](#scenario-1-local-backup-restore-in-one-environment)
- [Scenario 2: Server Backup Restore In One Environment](#scenario-2-server-backup-restore-in-one-environment)
- [Scenario 3: Create Backup And Restore To Target](#scenario-3-create-backup-and-restore-to-target)
- [Scenario 4: Local Migration File To Target](#scenario-4-local-migration-file-to-target)
- [Scenario 5: Create Migration From Rule](#scenario-5-create-migration-from-rule)
- [Discovery Checks](#discovery-checks)
- [Failure Cases](#failure-cases)
- [Smoke Checks](#smoke-checks)

## Goal

Validate that the publish skill uses the current API CLI commands, preserves command dependencies, and waits for confirmation before restore or migration execution.

All write workflows have two gates:

- Publish input confirmation: required before package creation, package download, migration rule creation, or migration check.
- Execution confirmation: required before backup restore, backup restore-upload, migration execute, or remove.

Named files, existing package lists, and migration rule lists lead to explicit user selection or confirmation.

Tests default to `sourceEnv=dev` and `targetEnv=dev`.

Downloaded files default to the CLI release workspace for the source environment:

```text
C:/Users/Enzo/.nocobase/release/dev/<file>
```

## Scenario 1: Local Backup Restore In One Environment

Input:

```text
Restore dev with local file ./backup-001.nbdata.
```

Expected plan:

```bash
nb api backup restore-upload --file ./backup-001.nbdata -e dev --json-output
```

Checks:

- The provided local file is used as the package source.
- The named local file is echoed before restore.
- `restore-upload` waits for `confirm`.
- `targetEnv=dev` is used.

## Scenario 2: Server Backup Restore In One Environment

Input:

```text
Restore dev with server backup backup-001.nbdata.
```

Expected plan:

```bash
nb api backup status --name backup-001.nbdata -e dev --json-output
nb api backup restore --name backup-001.nbdata -e dev --json-output
nb api backup restore-status --task <RESTORE_TASK_ID> -e dev --json-output
```

Checks:

- Direct `backup restore --name` is used because the backup exists on the target environment.
- The named backup is echoed and confirmed before restore.
- Restore waits for `confirm`.
- `restore-status` is called only when a restore task id is returned.

## Scenario 3: Create Backup And Restore To Target

Input:

```text
Create a backup from dev and restore it to dev.
```

Expected plan:

```bash
nb api backup create -e dev --json-output
nb api backup status --name <BACKUP_NAME> -e dev --json-output
nb api backup download --name <BACKUP_NAME> --output C:/Users/Enzo/.nocobase/release/dev/<BACKUP_NAME> -e dev
nb api backup restore-upload --file C:/Users/Enzo/.nocobase/release/dev/<BACKUP_NAME> -e dev --json-output
```

Checks:

- The generation plan is confirmed before `backup create`.
- `backupName` is parsed from create output.
- Download includes `--output` under the CLI release workspace.
- Restore uses the downloaded local file and waits for `confirm`.

## Scenario 4: Local Migration File To Target

Input:

```text
Migrate dev with local file ./migration-001.nbdata.
```

Expected plan:

```bash
nb api migration check --file ./migration-001.nbdata -e dev --json-output
nb api migration execute --file ./migration-001.nbdata -e dev --json-output
```

Checks:

- The provided local file is used as the package source.
- The local file is echoed and confirmed before check.
- Execute waits for `confirm`.

## Scenario 5: Create Migration From Rule

Input:

```text
Migrate dev to dev with ruleId rule_123.
```

Expected plan:

```bash
nb api migration rules get --filter-by-tk rule_123 -e dev --json-output
nb api migration create --rule-id rule_123 --title publish-dev-to-dev -e dev --json-output
nb api migration get --name <MIGRATION_NAME> -e dev --json-output
nb api migration download --name <MIGRATION_NAME> --output C:/Users/Enzo/.nocobase/release/dev/<MIGRATION_NAME> -e dev
nb api migration check --file C:/Users/Enzo/.nocobase/release/dev/<MIGRATION_NAME> -e dev --json-output
nb api migration execute --file C:/Users/Enzo/.nocobase/release/dev/<MIGRATION_NAME> -e dev --json-output
```

Checks:

- Missing file triggers migration package creation.
- Missing `ruleId` first runs `nb api migration rules list -e dev --json-output`, then waits for the user to select or create one.
- The selected rule or new rule plan is confirmed before `migration rules create` or `migration create`.
- `migrationName` is parsed from create output before download.
- If `migration get` reports `status=in_progress`, report that the package is still generating and wait; do not run `migration download` until `status=ok`.
- If `migration download` transiently fails after `migration get` reports `status=ok`, retry the same download once before failing.

## Discovery Checks

Run these checks when the user wants to inspect existing packages or migration rules before deciding whether to create a new package.

### Backup And Migration Packages

Expected commands:

```bash
nb api backup list -e dev --json-output
nb api migration list -e dev --json-output
```

Checks:

- Lists are used for packages that exist on the selected server environment.
- Empty lists lead to package creation or user selection from another environment.
- A listed package is selected by the user and confirmed before download, restore, check, or execute.

### Migration Rule Discovery

Expected commands:

```bash
nb api migration rules list -e dev --json-output
nb api migration rules get --filter-by-tk <RULE_ID> -e dev --json-output
nb api migration rules create --name <RULE_NAME> --user-defined-rule schema-only --system-defined-rule overwrite-first -e dev --json-output
```

Checks:

- `list` is used before asking the user to create a new rule when rules may already exist.
- `create` uses global rules.
- `create` requires publish input confirmation.
- `get` verifies the selected or created rule before `migration create`.

## Failure Cases

### Environment API Capability Unsupported

Command output:

```text
Request failed with status 404
"Not Found"
```

Expected:

- Mark the probed environment as `unsupported_publish_env`.
- Report that the required backup or migration capability depends on the commercial plugin and license activation state.
- The workflow remains at the capability gate.

### Missing Migration Rule

Input:

```text
Migrate dev to dev.
```

Expected:

- Run `nb api migration rules list -e dev --json-output`.
- Ask the user to select a `ruleId` or create a global rule.
- Migration package creation starts after rule selection and publish input confirmation.

### Server Package List Empty

Command output:

```json
[]
```

Expected:

- Report the empty package list.
- Ask whether to create a new package or inspect another source environment.

### Migration Rule Create Missing Id

Command output:

```json
{"name":"dev-to-dev"}
```

Expected:

- Keep the workflow before migration package creation.
- Report that no `ruleId` was returned.
- Ask the user to inspect rules with `nb api migration rules list -e dev --json-output`.

### Download Failed

Command output:

```text
Error: file not found
```

Expected:

- Keep the workflow at the download step.
- Report the source environment, method, requested file name, and output path.
- Ask whether to list packages again or create a new package.
- For migration downloads only, if `migration get` reports `status=ok`, retry the same download once before reporting the failure.

### Migration Check Failed

Command output:

```json
{"data":{"checkStatus":"failed","message":"adapter check failed"}}
```

Expected:

- Store the local file path.
- Keep the workflow before execute.
- Report the check failure.

### Execute Failed

Command output:

```text
State: failed
Error: migration failed
```

Expected:

- Report failed step and error.
- Suggest `nb api migration logs list -e dev --json-output`.

## Smoke Checks

Run these read-only checks before relying on the skill in a new CLI version:

```bash
nb api backup --help
nb api backup list --help
nb api backup create --help
nb api backup status --help
nb api backup download --help
nb api backup restore --help
nb api backup restore-upload --help
nb api backup restore-status --help
nb api migration --help
nb api migration list --help
nb api migration create --help
nb api migration download --help
nb api migration check --help
nb api migration execute --help
nb api migration rules list --help
nb api migration rules get --help
nb api migration rules create --help
nb api migration logs list --help
nb api migration logs get --help
nb api migration logs download --help
```
