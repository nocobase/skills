---
name: nocobase-publish-manage
description: Use when users need NocoBase publish restore or migration operations through nb publish generate, copy, and execute.
argument-hint: "[action: publish|plan|validate] [method: backup|migration] [source-env] [target-env] [file?] [rule-id?]"
allowed-tools: Bash, Read, Grep, Glob
owner: platform-tools
version: 3.0.0
last-reviewed: 2026-04-29
risk-level: high
---

# Goal

Safely orchestrate NocoBase publish workflows with direct `nb publish` commands only.

The skill converts user intent into a stateful publish context, carries command outputs between steps, and prevents destructive execution unless the required inputs and confirmation are present.

# Scope

- Backup restore through `nb publish generate`, `nb publish copy`, and `nb publish execute`.
- Migration publish through `nb publish generate`, `nb publish copy`, and `nb publish execute`.
- Existing publish file reuse from the global CLI publish workspace through `nb publish file`.
- Migration rule discovery and global-rule creation through `nb publish migration-rule`.
- Same-environment restore, cross-environment restore, and cross-environment migration.
- Publish planning, dry explanation, and failure diagnosis from command output.

# Non-Goals

- Do not use legacy publish-related command groups outside `nb publish`.
- Do not use Docker, app lifecycle commands, direct HTTP APIs, local scripts, or database commands as publish fallbacks.
- Do not guess a migration `ruleId`; run `nb publish migration-rule list` or create one when requested.
- Do not guess a publish file from unrelated prior runs; run `nb publish file list`.
- Do not execute destructive publish steps without secondary confirmation.

# Input Contract

| Input | Required | Default | Validation | Clarification |
|---|---|---|---|---|
| `action` | yes | inferred | `publish`, `plan`, or `validate` | "Should I plan or run the publish workflow?" |
| `method` | publish: yes | inferred | `backup` or `migration` | "Use backup restore or migration publish?" |
| `source_env` | conditional | none | non-empty env name | "Which environment provides the file or generates it?" |
| `target_env` | publish: yes | `source_env` for single-env restore | non-empty env name | "Which environment should receive and execute the publish file?" |
| `file` | optional | none | file name or local path ending in `.nbdata` | "Which existing publish file should be reused?" |
| `rule_id` | migration generate only | none | non-empty id | "Which migration rule ID should be used?" |
| `migration_user_rule` | migration rule create only | `schema-only` | `schema-only` or `overwrite` | "How should user-defined tables be handled?" |
| `migration_system_rule` | migration rule create only | `overwrite-first` | `overwrite-first` or `schema-only` | "How should system tables be handled?" |
| `title` | migration generate only | `publish-<source>-to-<target>` | non-empty text | "Which migration title should be used?" |
| `execute_options` | optional | safe CLI defaults | known `nb publish execute` flags only | "Any execute flags such as `--skip-backup`?" |
| `confirm_execute` | execute: yes | none | must be `confirm` | "Type `confirm` to execute on the target environment." |

# Mandatory Clarification Gate

- Max clarification rounds: 2.
- Ask at most 3 short questions per round.
- Stop before mutation when `method`, `source_env`, or `target_env` cannot be inferred.
- Stop before migration generation when `file` is absent and `rule_id` cannot be selected or created.
- Stop before `execute` unless the user has confirmed the exact method, source environment, target environment, file, and execute options.
- If the user says "you decide", choose the safest non-destructive path: plan the commands and stop before `execute`.

# Workflow

1. Route intent to `backup` or `migration`.
2. Build a publish context with `type`, `sourceEnv`, `targetEnv`, `fileArg`, `localFile`, `fileName`, `ruleId`, `generatedArtifactId`, and `uploadedArtifactId`.
3. Run the environment capability gate for every participating source or target environment before mutation. If any probe returns 404, `Not Found`, missing adapter, inactive plugin, or license capability errors, stop with `unsupported_publish_env`.
4. If `file` is provided, skip `generate` and set `fileArg` to the provided value.
5. If the user wants to reuse an existing file but did not name one, run `nb publish file list --scope local --type <type> --env <sourceEnv> --json` first; if remote discovery is needed, run `nb publish file list --scope remote --type <type> --env <sourceEnv> --json`.
6. If a remote file must be reused locally, run `nb publish file pull --type <type> --env <sourceEnv> --file <fileName>`.
7. If `file` is absent and `type=migration`, run `nb publish migration-rule list --env <sourceEnv> --json`; if the user asks to create a global rule, run `nb publish migration-rule create --json`, then verify the selected or created rule with `nb publish migration-rule get --env <sourceEnv> --id <ruleId> --json`.
8. If `file` is absent, run `nb publish generate` for the selected type and source environment.
9. Parse `Local file:` and `Artifact:` from `generate` output, then set `fileName` from the basename of `Local file`.
10. Run `nb publish copy` with the context file and target environment.
11. Parse `Artifact:` and `Check passed:` from `copy` output. Stop if the check fails or the command reports an error.
12. Before `execute`, show the resolved publish context and require `confirm_execute=confirm`.
13. Run `nb publish execute` with `--file <fileArg>` first. If manifest lookup fails and `uploadedArtifactId` is available, retry only after user confirmation with `--artifact <uploadedArtifactId>`.
14. Report the final state, result, error lines, commands executed, and next verification step.

See [Runtime Contract](references/v1-runtime-contract.md) for exact command construction and parsing rules.

# Reference Loading Map

| Reference | Use When |
|---|---|
| [Intent Routing](references/intent-routing.md) | Mapping user phrases to backup, migration, file reuse, and environment shape. |
| [Runtime Contract](references/v1-runtime-contract.md) | Building commands, transferring file/artifact/rule values, and handling fallbacks. |
| [Test Playbook](references/test-playbook.md) | Validating the five supported publish scenarios and failure cases. |

# Safety Gate

High-impact actions:

- `nb publish execute --type backup`
- `nb publish execute --type migration`
- retrying execute with `--artifact`
- any execute option that skips target backup or revert behavior

Secondary confirmation template:

```text
Confirm execution: publish <method> from <source_env> to <target_env> using <fileName or artifactId>. This may change target data. Reply `confirm` to continue.
```

Rollback guidance:

- If `copy` fails, do not execute; keep the local file and report the upload error.
- If `execute` fails, report `State`, `Error`, and CLI result output exactly enough for diagnosis.
- For backup restore failures, do not run another restore automatically; ask the user whether to use the target backup created by the server.
- For migration failures, do not regenerate or rerun with different rule values without explicit user instruction.
- Preserve the publish context in the final response so the user can resume from the correct file or artifact.

# Verification Checklist

- Only `nb publish` commands are used for publish operations.
- Legacy publish-related command groups outside `nb publish` are not used.
- A publish context is built before mutation.
- Participating environments pass the publish capability gate before mutation.
- Capability probe failures are reported as `unsupported_publish_env`, not treated as empty lists.
- Existing `file` input skips `generate`.
- Existing remote file input uses `publish file pull` before `copy` when the file is not already local.
- Missing backup file triggers `generate --type backup`.
- Missing migration file triggers `publish migration-rule list` before asking for or creating `rule_id`.
- `publish migration-rule create` uses only global rules.
- Selected or created migration rules are verified with `publish migration-rule get` when possible.
- Migration generation uses the official `--migration-rule` parameter only.
- `Local file:` is parsed before deriving `fileName`.
- `copy` uses `--from` when `fileArg` is a file name under the global CLI workspace.
- `copy` output is checked for `Artifact:` and failed check results.
- `execute` is blocked until secondary confirmation is present.
- `execute` uses `--file` before considering `--artifact`.
- Failure output includes the failed step and relevant CLI lines.

# References

- [Intent Routing](references/intent-routing.md)
- [Runtime Contract](references/v1-runtime-contract.md)
- [Test Playbook](references/test-playbook.md)
- [NocoBase Migration Manager](https://docs.nocobase.com/ops-management/migration-manager/): official context for migration risk and publish-related operations. [verified: 2026-04-29]
