# Test Playbook

## Contents

- [Goal](#goal)
- [Scenario 1: Specified File Backup Restore In One Environment](#scenario-1-specified-file-backup-restore-in-one-environment)
- [Scenario 2: Restore Current Environment](#scenario-2-restore-current-environment)
- [Scenario 3: Restore Source Environment To Target](#scenario-3-restore-source-environment-to-target)
- [Scenario 4: Specified File Migration To Target](#scenario-4-specified-file-migration-to-target)
- [Scenario 5: Migrate Source Environment To Target](#scenario-5-migrate-source-environment-to-target)
- [Discovery Checks](#discovery-checks)
- [Failure Cases](#failure-cases)
- [Smoke Checks](#smoke-checks)

## Goal

Validate that the publish skill preserves command dependencies and blocks unsafe execution.

## Scenario 1: Specified File Backup Restore In One Environment

Input:

```text
Restore dev with file backup-001.nbdata.
```

Expected plan:

```bash
nb publish copy --type backup --from dev --to dev --file backup-001.nbdata
nb publish execute --type backup --env dev --file backup-001.nbdata --yes --wait
```

Checks:

- `generate` is not run.
- `copy` runs before `execute`.
- `execute` waits for `confirm`.

## Scenario 2: Restore Current Environment

Input:

```text
Restore dev.
```

Expected plan:

```bash
nb publish generate --type backup --env dev --wait
nb publish copy --type backup --from dev --to dev --file <generatedFileName>
nb publish execute --type backup --env dev --file <generatedFileName> --yes --wait
```

Checks:

- `Local file:` is parsed from generate output.
- `fileName` is derived from the generated local file path.
- The generated file name, not a guessed latest file, is passed to copy and execute.

## Scenario 3: Restore Source Environment To Target

Input:

```text
Restore dev to test.
```

Expected plan:

```bash
nb publish generate --type backup --env dev --wait
nb publish copy --type backup --from dev --to test --file <generatedFileName>
nb publish execute --type backup --env test --file <generatedFileName> --yes --wait
```

Checks:

- Source remains `dev`.
- Target remains `test`.
- Execute runs on `test`, not `dev`.

## Scenario 4: Specified File Migration To Target

Input:

```text
Migrate file migration-001.nbdata to test.
```

Expected plan:

```bash
nb publish copy --type migration --from <sourceEnv> --to test --file migration-001.nbdata
nb publish execute --type migration --env test --file migration-001.nbdata --yes --wait
```

Checks:

- `generate` is not run.
- `ruleId` is not required when a migration file is provided.
- Source environment is required when the file is a plain file name.

## Scenario 5: Migrate Source Environment To Target

Input:

```text
Migrate dev to test with ruleId rule_123.
```

Expected plan:

```bash
nb publish generate --type migration --env dev --migration-rule rule_123 --title publish-dev-to-test --wait
nb publish copy --type migration --from dev --to test --file <generatedFileName>
nb publish execute --type migration --env test --file <generatedFileName> --yes --wait
```

Checks:

- Missing file triggers migration generation.
- Missing `ruleId` first runs `nb publish migration-rule list --env dev`, then blocks generation until the user selects or creates one.
- `generatedArtifactId` and `uploadedArtifactId` are captured separately.

## Discovery Checks

Run these checks when the user wants to inspect existing packages or migration rules before deciding whether to generate a new package.

### Local And Remote Publish Files

Expected commands:

```bash
nb publish file list --scope local --type backup --env dev --json
nb publish file list --scope remote --type backup --env dev --page-size 2 --json
nb publish file list --scope remote --type migration --env dev --page-size 2 --json
```

Checks:

- Local list is used for files already in the global CLI workspace.
- Remote list is used for packages that exist on the source environment server.
- Empty lists stop the reuse flow and lead to either generation or user selection from another environment.

### Pull Remote Publish File

Expected command:

```bash
nb publish file pull --type backup --env dev --file <fileName>
```

Checks:

- Pull runs before `copy` when the selected package is remote.
- The pulled file remains under the CLI publish workspace for the selected type and environment.
- If pull fails, stop before `copy`.

### Migration Rule Discovery

Expected commands:

```bash
nb publish migration-rule list --env dev --page-size 5 --json
nb publish migration-rule get --env dev --id <ruleId> --json
nb publish migration-rule create --env dev --name <name> --user-rule schema-only --system-rule overwrite-first --json
```

Checks:

- `list` is used before asking the user to create a new rule when rules already exist.
- `create` only creates global rules.
- `get` verifies the selected or created rule before `generate --type migration`.

## Failure Cases

### Environment Publish Capability Unsupported

Command output:

```text
Request failed with status 404
"Not Found"
```

Expected:

- Mark the probed environment as `unsupported_publish_env`.
- Report that the required backup or migration capability may be unavailable because the commercial plugin is not installed, not licensed, or not activated.
- Do not continue to `generate`, `copy`, or `execute`.
- Do not treat this as an empty package list.

### Missing Migration Rule

Input:

```text
Migrate dev to test.
```

Expected:

- Run `nb publish migration-rule list --env <sourceEnv> --json`.
- Ask the user to select a `ruleId` or create a global rule.
- Do not run `nb publish generate`.

### Remote File List Empty

Command output:

```json
[]
```

Expected:

- Do not guess a file name.
- Ask whether to generate a new package or inspect another source environment.

### Migration Rule Create Missing Id

Command output:

```json
{"name":"dev-to-test"}
```

Expected:

- Stop before migration generation.
- Report that no `ruleId` was returned.
- Ask the user to inspect rules with `nb publish migration-rule list --env <sourceEnv> --json`.

### File Pull Failed

Command output:

```text
Error: remote file not found
```

Expected:

- Stop before copy.
- Report the source environment, type, and requested file name.
- Ask whether to list remote files again or generate a new package.

### Copy Check Failed

Command output:

```text
Artifact: artifact_123
Check passed: no
Warning: adapter check failed
```

Expected:

- Store `uploadedArtifactId=artifact_123`.
- Stop before execute.
- Report the warning.

### Manifest Lookup Missing

Command output:

```text
No uploaded artifact found for file.nbdata on test. Run `nb publish copy` first or use --artifact.
```

Expected:

- If `uploadedArtifactId` exists, ask whether to retry execute with `--artifact`.
- If `uploadedArtifactId` is missing, stop and ask the user to rerun copy.

### Execute Failed

Command output:

```text
State: failed
Error: restore failed
```

Expected:

- Stop immediately.
- Report failed step and error.
- Do not attempt rollback automatically.

## Smoke Checks

Run these read-only checks before relying on the skill in a new CLI version:

```bash
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
