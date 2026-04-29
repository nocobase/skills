# Runtime Contract

## Contents

- [Goal](#goal)
- [Command Surface](#command-surface)
- [Publish Context](#publish-context)
- [Environment Capability Gate](#environment-capability-gate)
- [Global Publish Workspace](#global-publish-workspace)
- [Generate Step](#generate-step)
- [Copy Step](#copy-step)
- [Execute Step](#execute-step)
- [Output Parsing](#output-parsing)
- [Failure Handling](#failure-handling)

## Goal

Execute NocoBase publish workflows as a stateful chain of `nb publish generate`, `nb publish copy`, and `nb publish execute`.

## Command Surface

Allowed publish commands:

```bash
nb publish file list --scope local --type <backup|migration> --env <sourceEnv> --json
nb publish file list --scope remote --type <backup|migration> --env <sourceEnv> --json
nb publish file pull --type <backup|migration> --env <sourceEnv> --file <fileName>
nb publish migration-rule list --env <sourceEnv> --json
nb publish migration-rule get --env <sourceEnv> --id <ruleId> --json
nb publish migration-rule create --env <sourceEnv> --name <name> --user-rule <schema-only|overwrite> --system-rule <overwrite-first|schema-only> --json
nb publish generate --type backup --env <sourceEnv> --wait
nb publish generate --type migration --env <sourceEnv> --migration-rule <ruleId> --title <title> --wait
nb publish copy --type <backup|migration> --from <sourceEnv> --to <targetEnv> --file <fileArg>
nb publish execute --type <backup|migration> --env <targetEnv> --file <fileArg> --yes --wait
nb publish execute --type <backup|migration> --env <targetEnv> --artifact <uploadedArtifactId> --yes --wait
```

Do not use legacy publish-related command groups outside `nb publish`, direct API calls, Docker commands, or local scripts for publish execution.

## Publish Context

Maintain this context throughout the workflow:

```json
{
  "type": "backup|migration",
  "sourceEnv": "dev",
  "targetEnv": "test",
  "ruleId": "optional migration rule id",
  "title": "optional migration title",
  "fileArg": "fileName.nbdata or local path",
  "localFile": "absolute local file path when known",
  "fileName": "fileName.nbdata",
  "generatedArtifactId": "artifact id from generate",
  "uploadedArtifactId": "artifact id from copy",
  "pulledFile": "optional file pull result",
  "migrationRule": "optional selected or created migration rule",
  "step": "planned|generated|copied|executed"
}
```

Never infer a later command argument from memory when the context has an explicit value.

## Environment Capability Gate

Before a workflow mutates any environment, verify that each participating environment supports the requested publish capability.

Capability probes:

```bash
nb publish file list --scope remote --type backup --env <env> --page-size 1 --json
nb publish file list --scope remote --type migration --env <env> --page-size 1 --json
nb publish file list --scope remote --source artifact --type backup --env <env> --page-size 1 --json
nb publish file list --scope remote --source artifact --type migration --env <env> --page-size 1 --json
nb publish migration-rule list --env <sourceEnv> --page-size 1 --json
```

Rules:

- For backup restore, the source environment must support backup package generation or listing, and the target environment must support publish artifact staging plus backup restore execution.
- For migration publish, the source environment must support migration rules and migration package generation, and the target environment must support publish artifact staging plus migration execution.
- The target environment must pass `--source artifact` probes because `copy` uploads into the publish manager staging area before `execute`.
- Treat HTTP 404, `Not Found`, unknown resource, missing adapter, missing plugin, inactive plugin, or license/commercial capability errors as `unsupported_publish_env`.
- An empty package list is not the same as unsupported capability. Empty list means the feature exists but no package is available.
- If any required environment is `unsupported_publish_env`, stop before `generate`, `copy`, or `execute`.
- Report the environment, publish type, failed probe command, and likely cause: the required commercial plugin is not installed, not activated, or not licensed.

## Global Publish Workspace

Generated files default to the global CLI workspace:

```text
<global-cli-root>/.nocobase/publish/<type>/<sourceEnv>/<fileName>.nbdata
```

On Windows without `NB_CLI_ROOT`, this is normally:

```text
C:\Users\Enzo\.nocobase\publish\<type>\<sourceEnv>\<fileName>.nbdata
```

When `NB_CLI_ROOT` is set, use:

```text
%NB_CLI_ROOT%\.nocobase\publish\<type>\<sourceEnv>\<fileName>.nbdata
```

If `fileArg` is a plain file name, `copy` must include `--from <sourceEnv>` so the CLI can resolve it under the global workspace. If `fileArg` is a path, still prefer passing `--from` when the source environment is known so the manifest remains useful.

## Generate Step

Before generate:

- If the user wants to reuse an existing local package, run `nb publish file list --scope local --type <type> --env <sourceEnv> --json` and let the user select a file.
- If the user wants to reuse a remote package, run `nb publish file list --scope remote --type <type> --env <sourceEnv> --json`, then `nb publish file pull --type <type> --env <sourceEnv> --file <fileName>`.
- Treat the pulled file as the selected `fileArg` and skip generate.

Backup generation:

```bash
nb publish generate --type backup --env <sourceEnv> --wait
```

Migration generation:

```bash
nb publish generate --type migration --env <sourceEnv> --migration-rule <ruleId> --title <title> --wait
```

Rules:

- Skip this step when the user provided `file`.
- Require `ruleId` before migration generation.
- If `ruleId` is unknown, discover with `nb publish migration-rule list --env <sourceEnv> --json`.
- If the user asks to create a global migration rule, create it with `nb publish migration-rule create --user-rule <schema-only|overwrite> --system-rule <overwrite-first|schema-only> --json`.
- Verify a selected or created rule with `nb publish migration-rule get --env <sourceEnv> --id <ruleId> --json` when possible.
- Use the official `--migration-rule` parameter only.
- Parse `Local file:` from stdout into `localFile`.
- Parse `Artifact:` from stdout into `generatedArtifactId`.
- Set `fileName` to the basename of `localFile`.
- Set `fileArg=fileName` after successful generation unless the user explicitly requested a path.
- If `Local file:` is missing after a successful generate command, inspect only the global publish directory for the same `type` and `sourceEnv`, sort `.nbdata` files by modified time, and use the newest file as a same-run fallback.

## Copy Step

Copy command:

```bash
nb publish copy --type <type> --from <sourceEnv> --to <targetEnv> --file <fileArg>
```

Rules:

- Always run copy before execute.
- Parse `Artifact:` from stdout into `uploadedArtifactId`.
- If stdout contains `Check passed: no`, stop before execute.
- If stdout contains `Warning:` or adapter check details, report them in the final response.
- Do not replace `fileArg` with `localFile` after copy unless the user explicitly supplied a path.

## Execute Step

Primary execute command:

```bash
nb publish execute --type <type> --env <targetEnv> --file <fileArg> --yes --wait
```

Fallback execute command:

```bash
nb publish execute --type <type> --env <targetEnv> --artifact <uploadedArtifactId> --yes --wait
```

Rules:

- Require secondary confirmation before execute.
- Use `--file` first so the CLI manifest resolves the uploaded artifact.
- Only use `--artifact` if the `--file` path fails with `No uploaded artifact found` and `uploadedArtifactId` is known.
- Before retrying with `--artifact`, ask the user to confirm the fallback execution.
- Include user-provided `--var` and `--secret` values only for migration execution.
- Treat `--skip-backup`, `--no-backup-before-execute`, and `--skip-revert-on-error` as high-risk options that require explicit mention in the confirmation summary.

## Output Parsing

Parse case-insensitive labels from stdout:

- `Local file: <path>`
- `Artifact: <artifactId>`
- `Check passed: yes|no`
- `State: <state>`
- `Error: <message>`

Do not require JSON output from publish commands.

Prefer JSON output for discovery commands:

- `file list --json`
- `migration-rule list --json`
- `migration-rule get --json`
- `migration-rule create --json`

For `file pull`, capture the local file path, file name, and checksum when the CLI reports them. At minimum, preserve the selected `fileName` so `copy` can resolve the file under the global workspace.

## Failure Handling

- On generate failure, stop and report the command and error output.
- On copy failure, stop and report whether the file path or target capability failed.
- On execute failure, stop and report the state, result, and error lines.
- On capability probe failure, stop and report `unsupported_publish_env`; do not continue with publish commands.
- Do not automatically regenerate a file after a copy or execute failure.
- Do not automatically create a new migration rule after a migration generation failure.
- Preserve the context values collected before the failure.
