# Publish Skill Test Notes

This folder tracks prompt-first runtime verification for `nocobase-publish-manage`.

## Primary Test Assets

- `./capability-test-plan.md`: capability matrix, environment variables, and assertions.
- `./test-playbook.md`: prompt-driven acceptance cases for API backup and migration workflows.

## Environment Variables

Use one editable environment block for the whole suite:

```text
BASE_DIR=E:\work\nocobase
SOURCE_ENV=dev
TARGET_ENV=dev
BACKUP_NAME=<backup-file-name.nbdata>
BACKUP_FILE=./backup.nbdata
MIGRATION_NAME=<migration-file-name.nbdata>
MIGRATION_FILE=./migration.nbdata
MIGRATION_RULE_ID=<migration-rule-id>
MIGRATION_RULE_NAME=publish-dev-to-dev
USER_RULE=schema-only
SYSTEM_RULE=overwrite-first
CLI_HOME=C:\Users\Enzo\.nocobase
RELEASE_DIR=<CLI_HOME>\release\<SOURCE_ENV>
DOWNLOADED_BACKUP_FILE=<RELEASE_DIR>\<BACKUP_NAME>
DOWNLOADED_MIGRATION_FILE=<RELEASE_DIR>\<MIGRATION_NAME>
```

Both source and target environments are `dev` for the current test round. Change `TARGET_ENV` only when a separate target environment is intentionally available. Downloaded packages should be written to the CLI release workspace for the source environment, for example `C:\Users\Enzo\.nocobase\release\dev\<file>`.

## Recommended Verification Flow

1. Run read-only CLI capability checks:

```bash
cd <BASE_DIR>
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

2. Run discovery checks for backup files, migration files, migration rules, and migration logs.

3. Run the API capability gate for both source and target. In this test round both are `dev`.

4. Run the five core workflow prompts from `./test-playbook.md`.

5. Keep restore and migration execution at the secondary confirmation gate unless the case explicitly includes the continuation prompt.

## Safety Requirements

- Use `nb api backup ...` and `nb api migration ...` commands.
- Treat backup restore and migration execute as high impact and require explicit confirmation.
- Require publish input confirmation before package create, package download, migration rule create, or migration check.
- Record source environment, target environment, file names, local paths, migration rule id, and status output.
- File and migration rule selection is explicit.
- If a source or target environment returns 404, `Not Found`, missing plugin, inactive plugin, or license capability errors for backup/migration probes, mark that environment as unsupported and stop at the capability gate.

## Report Guidance

For each case, record:

- case id
- prompt used
- command(s) executed or planned
- status: `pass`, `warn`, `fail`, or `blocked`
- selected source and target environments
- selected file, backup name, migration name, or migration rule id
- whether execution was blocked pending confirmation
- concise evidence and recovery guidance
