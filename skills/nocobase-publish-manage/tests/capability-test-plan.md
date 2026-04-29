# Publish Capability Verification Matrix

This document defines capability checks for `nocobase-publish-manage` using prompt-first skill verification and `nb publish` CLI evidence.

Companion acceptance suite:

- `./test-playbook.md`

## Scope

Included:

- CLI readiness
- environment variable handling
- source and target environment publish capability checks
- local and remote publish file discovery
- remote publish file pull
- migration rule list/get/create
- backup generate/copy/execute planning
- migration generate/copy/execute planning
- confirmation gates and failure handling

Excluded:

- direct REST mutation
- direct database inspection
- plugin-specific API fallback
- automatic destructive execution without secondary confirmation

## Runtime Inputs

Required:

| Placeholder | Default | Meaning |
|---|---|---|
| `<BASE_DIR>` | `E:\work\nocobase` | Workspace where `nb` is available. |
| `<SOURCE_ENV>` | `dev` | Environment that provides or generates the publish package. |
| `<TARGET_ENV>` | `dev` | Environment that receives and executes the publish package. |

Optional or case-specific:

| Placeholder | Default | Meaning |
|---|---|---|
| `<BACKUP_FILE>` | none | Existing backup package file name. |
| `<MIGRATION_FILE>` | none | Existing migration package file name. |
| `<MIGRATION_RULE_ID>` | none | Selected migration rule id. |
| `<MIGRATION_RULE_NAME>` | `publish-dev-to-target` | New global migration rule name. |
| `<USER_RULE>` | `schema-only` | User-defined table rule. Allowed: `schema-only`, `overwrite`. |
| `<SYSTEM_RULE>` | `overwrite-first` | System table rule. Allowed: `overwrite-first`, `schema-only`. |
| `<GENERATED_FILE>` | from CLI output | File name parsed from `Local file:`. |
| `<UPLOADED_ARTIFACT_ID>` | from CLI output | Artifact id parsed from `copy` output. |

## Capability IDs

| ID | Domain | Capability | Validation Mode |
|---|---|---|---|
| PUB-SMOKE-001 | cli | `nb publish` command group help is available | runtime/read-only |
| PUB-SMOKE-002 | cli | `file`, `migration-rule`, `generate`, `copy`, `execute` help is available | runtime/read-only |
| PUB-ENV-001 | env | source and target env variables are carried through every step | prompt + runtime |
| PUB-ENV-002 | env | source and target support the requested backup/migration publish capability | runtime/read-only |
| PUB-FILE-001 | file | list local backup/migration packages | runtime/read-only |
| PUB-FILE-002 | file | list remote backup/migration packages | runtime/read-only |
| PUB-FILE-003 | file | pull selected remote package before copy | runtime |
| PUB-RULE-001 | migration-rule | list migration rules before migration generation when rule id is missing | runtime/read-only |
| PUB-RULE-002 | migration-rule | create global migration rule with allowed option values | runtime |
| PUB-RULE-003 | migration-rule | get selected or created migration rule before generation | runtime/read-only |
| PUB-BACKUP-001 | backup | specified file restore in one environment | prompt + optional runtime |
| PUB-BACKUP-002 | backup | restore current environment by generating a backup package | prompt + optional runtime |
| PUB-BACKUP-003 | backup | restore source environment to target by generating a backup package | prompt + optional runtime |
| PUB-MIGRATION-001 | migration | specified file migration to target | prompt + optional runtime |
| PUB-MIGRATION-002 | migration | migrate source environment to target by generating a migration package | prompt + optional runtime |
| PUB-GUARD-001 | safety | execute requires secondary confirmation | prompt |
| PUB-GUARD-002 | safety | missing file selection blocks copy | prompt |
| PUB-GUARD-003 | safety | missing migration rule blocks migration generation | prompt |
| PUB-FAIL-001 | failure | empty remote list does not guess a package | prompt |
| PUB-FAIL-002 | failure | file pull failure blocks copy | prompt |
| PUB-FAIL-003 | failure | copy check failure blocks execute | prompt |
| PUB-FAIL-004 | failure | 404 or missing plugin response marks environment as unsupported for publish | runtime/prompt |

## Status Semantics

- `pass`: expected command chain and safety gate are satisfied.
- `warn`: capability is available but runtime verification was intentionally skipped.
- `blocked`: required environment, file, or migration rule input is missing.
- `fail`: command chain, context, or safety behavior is wrong.

## Critical Assertions

- Only `nb publish ...` commands are allowed.
- Existing `<BACKUP_FILE>` or `<MIGRATION_FILE>` skips `generate`.
- Capability probe failures are different from empty package lists.
- HTTP 404, `Not Found`, missing adapter, inactive plugin, or license capability errors stop the workflow as `unsupported_publish_env`.
- Target environments must pass `file list --scope remote --source artifact` probes because `copy` uploads into publish manager staging before execution.
- If the user wants to choose an existing package, run `nb publish file list` before asking them to select.
- Remote file reuse requires `nb publish file pull` before `copy`.
- Backup without file runs `generate --type backup`.
- Migration without file requires a selected or created migration rule before `generate --type migration`.
- New migration generation uses the official `--migration-rule` parameter only.
- Migration rule creation only uses global rule options:
  - user-defined tables: `schema-only` or `overwrite`
  - system tables: `overwrite-first` or `schema-only`
- `copy` always runs before `execute`.
- `execute` runs against `<TARGET_ENV>`, not `<SOURCE_ENV>` unless they are intentionally the same.
- `execute` is blocked until secondary confirmation is present.
- If `copy` reports `Check passed: no`, do not execute.

## Recommended Serial Order

Run in strict serial order:

1. TC01 CLI readiness smoke
2. TC02 environment context
3. TC03 environment publish capability gate
4. TC04 local and remote file discovery
5. TC05 migration rule discovery/create/get
6. TC06 specified file backup restore, one environment
7. TC07 restore current environment by generating a backup package
8. TC08 restore source environment to target by generating a backup package
9. TC09 specified file migration
10. TC10 migrate source environment to target by generating a migration package
11. TC11-TC17 safety and failure cases

`TC07` and `TC09` can run with `<TARGET_ENV>=dev` during the first round. They become true cross-environment checks when `<TARGET_ENV>` is changed to `test`.
