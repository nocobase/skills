# Publish Skill Test Notes

This folder tracks prompt-first runtime verification for `nocobase-publish-manage`.

## Primary Test Assets

- `./capability-test-plan.md`: capability matrix, environment variables, and assertions.
- `./test-playbook.md`: prompt-driven acceptance cases for publish workflows.

## Environment Variables

Use one editable environment block for the whole suite:

```text
BASE_DIR=E:\work\nocobase
SOURCE_ENV=dev
TARGET_ENV=dev
BACKUP_FILE=<backup-file-name.nbdata>
MIGRATION_FILE=<migration-file-name.nbdata>
MIGRATION_RULE_ID=<migration-rule-id>
MIGRATION_RULE_NAME=publish-dev-to-target
USER_RULE=schema-only
SYSTEM_RULE=overwrite-first
```

`TARGET_ENV=dev` is valid for the first round. When a `test` environment is ready, change only `TARGET_ENV=test` and rerun the cross-environment cases.

## Recommended Verification Flow

1. Run read-only CLI capability checks:

```bash
cd <BASE_DIR>
nb publish --help
nb publish file --help
nb publish file list --help
nb publish file pull --help
nb publish migration-rule --help
nb publish migration-rule list --help
nb publish migration-rule get --help
nb publish migration-rule create --help
nb publish generate --help
nb publish copy --help
nb publish execute --help
```

2. Run discovery checks for local files, remote files, and migration rules.

3. Run the environment publish capability gate for both source and target.

4. Run the five core workflow prompts from `./test-playbook.md`.

5. Stop before `nb publish execute` unless the case explicitly includes the secondary confirmation prompt.

## Safety Requirements

- Use `nb publish ...` commands only.
- Do not use legacy publish-related command groups outside `nb publish`.
- Do not use direct REST/API calls, local scripts, Docker, or database fallback paths.
- Treat `nb publish execute` as high impact and require explicit confirmation.
- Record source environment, target environment, file name, local path, generated artifact id, and uploaded artifact id.
- When a file or migration rule needs user selection, stop and ask; do not guess from prior output.
- If a source or target environment returns 404, `Not Found`, missing plugin, inactive plugin, or license capability errors for backup/migration probes, mark that environment as unsupported for publish and stop.
- For target environments, include `--source artifact` probes because upload/copy depends on the publish manager staging API.

## Report Guidance

For each case, record:

- case id
- prompt used
- command(s) executed or planned
- status: `pass`, `warn`, `fail`, or `blocked`
- selected source and target environments
- selected file or migration rule id
- whether execution was blocked pending confirmation
- concise evidence and recovery guidance
