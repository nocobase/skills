# Publish Capability Verification Matrix

This document defines capability checks for `nocobase-publish-manage` using prompt-first skill verification and `nb api` CLI evidence.

Companion acceptance suite:

- `./test-playbook.md`

## Scope

Included:

- CLI readiness
- environment variable handling
- source and target API capability checks
- backup and migration package discovery
- backup create/status/download/restore-upload planning
- backup direct restore planning for same-environment server backups
- migration rule list/get/create
- migration create/download/check/execute planning
- migration log discovery for diagnosis
- confirmation gates and failure handling

## Runtime Inputs

Required:

| Placeholder | Default | Meaning |
|---|---|---|
| `<BASE_DIR>` | `E:\work\nocobase` | Workspace where `nb` is available. |
| `<SOURCE_ENV>` | `dev` | Environment that provides or generates the package. |
| `<TARGET_ENV>` | `dev` | Environment that receives restore or migration execution. |

Optional or case-specific:

| Placeholder | Default | Meaning |
|---|---|---|
| `<BACKUP_NAME>` | unset | Server backup package file name. |
| `<BACKUP_FILE>` | `./backup.nbdata` | Local backup package path. |
| `<MIGRATION_NAME>` | unset | Server migration package file name. |
| `<MIGRATION_FILE>` | `./migration.nbdata` | Local migration package path. |
| `<MIGRATION_RULE_ID>` | unset | Selected migration rule id. |
| `<MIGRATION_RULE_NAME>` | `publish-dev-to-dev` | New global migration rule name. |
| `<USER_RULE>` | `schema-only` | User-defined table rule. Allowed: `schema-only`, `overwrite`. |
| `<SYSTEM_RULE>` | `overwrite-first` | System-defined table rule. Allowed: `overwrite-first`, `schema-only`. |
| `<CLI_HOME>` | user CLI home, for example `C:\Users\Enzo\.nocobase` | CLI workspace root. |
| `<RELEASE_DIR>` | `<CLI_HOME>\release\<SOURCE_ENV>` | Source-environment release workspace. |
| `<DOWNLOADED_BACKUP_FILE>` | `<RELEASE_DIR>\<BACKUP_NAME>` | Path passed to `backup download --output`. |
| `<DOWNLOADED_MIGRATION_FILE>` | `<RELEASE_DIR>\<MIGRATION_NAME>` | Path passed to `migration download --output`. |

## Capability IDs

| ID | Domain | Capability | Validation Mode |
|---|---|---|---|
| PUB-SMOKE-001 | cli | `nb api backup` command group help is available | runtime/read-only |
| PUB-SMOKE-002 | cli | `nb api migration`, `migration rules`, and `migration logs` help is available | runtime/read-only |
| PUB-ENV-001 | env | source and target env variables are carried through every step | prompt + runtime |
| PUB-ENV-002 | env | source and target support requested backup/migration API commands | runtime/read-only |
| PUB-BACKUP-FILE-001 | backup | list backup packages | runtime/read-only |
| PUB-BACKUP-FILE-002 | backup | download selected backup with `--output` | runtime |
| PUB-MIGRATION-FILE-001 | migration | list migration packages | runtime/read-only |
| PUB-MIGRATION-FILE-002 | migration | download selected migration with `--output` | runtime |
| PUB-RULE-001 | migration-rule | list migration rules before migration creation when rule id is missing | runtime/read-only |
| PUB-RULE-002 | migration-rule | create global migration rule with allowed option values | runtime |
| PUB-RULE-003 | migration-rule | get selected or created migration rule before package creation | runtime/read-only |
| PUB-BACKUP-001 | backup | local file restore-upload in one environment | prompt + optional runtime |
| PUB-BACKUP-002 | backup | server backup restore in same environment | prompt + optional runtime |
| PUB-BACKUP-003 | backup | create backup, download, then restore-upload to target | prompt + optional runtime |
| PUB-MIGRATION-001 | migration | local migration file check and execute | prompt + optional runtime |
| PUB-MIGRATION-002 | migration | create migration package from selected rule, download, check, execute | prompt + optional runtime |
| PUB-GUARD-001 | safety | restore/execute requires secondary confirmation | prompt |
| PUB-GUARD-002 | safety | missing backup file selection stays at selection step | prompt |
| PUB-GUARD-003 | safety | missing migration rule stays at rule selection step | prompt |
| PUB-GUARD-004 | safety | selected file requires input confirmation before check or restore | prompt |
| PUB-GUARD-005 | safety | existing migration rule list requires explicit selection before package creation | prompt |
| PUB-GUARD-006 | safety | new migration rule creation requires input confirmation | prompt |
| PUB-FAIL-001 | failure | empty package list stays in discovery flow | prompt |
| PUB-FAIL-002 | failure | download failure keeps workflow at download step | prompt |
| PUB-FAIL-003 | failure | migration check failure keeps workflow before execute | prompt |
| PUB-FAIL-004 | failure | 404 or missing plugin response marks environment as unsupported | runtime/prompt |

## Status Semantics

- `pass`: expected command chain and safety gate are satisfied.
- `warn`: capability is available but runtime verification was intentionally skipped.
- `blocked`: required environment, file, or migration rule input is missing.
- `fail`: command chain, context, or safety behavior is wrong.

## Critical Assertions

- Commands use `nb api backup ...` and `nb api migration ...`.
- `<SOURCE_ENV>` and `<TARGET_ENV>` both default to `dev`.
- Existing `<BACKUP_FILE>` or `<MIGRATION_FILE>` skips package creation.
- Existing package lists and migration rule lists require explicit user selection.
- New migration rule creation requires confirmation of name, user-defined rule, and system-defined rule before `create`.
- Capability probe failures are different from empty package lists.
- HTTP 404, `Not Found`, missing adapter, inactive plugin, or license capability errors stop the workflow as `unsupported_publish_env`.
- If the user wants to choose an existing package, run `nb api backup list` or `nb api migration list` before asking them to select.
- Backup package creation runs `backup create`, parses `backupName`, downloads with `--output`, then uses `restore-upload`.
- Downloaded backup and migration packages are stored under `<CLI_HOME>\release\<SOURCE_ENV>\`.
- Same-environment server backup restore may use `backup restore --name`.
- Migration package creation requires a selected or created migration rule before `migration create`.
- New migration package creation uses `--rule-id`.
- Migration package execution runs `migration check --file` before `migration execute --file`.
- `backup restore-status` is called only with a returned `--task <taskId>`, parsed from `data.taskId` or `data.task`.
- Migration packages created from rules wait for `migration get` to report `status=ok`; `status=in_progress` is reported as still generating.
- A transient migration download 400/503 after package status is `ok` may be retried once before failing.
- `restore` and `execute` wait for secondary confirmation.
- Publish input confirmation is separate from restore and execute confirmation.
- If `migration check` reports failure, the workflow remains before execute.

## Recommended Serial Order

Run in strict serial order:

1. TC01 CLI readiness smoke
2. TC02 environment context
3. TC03 API capability gate
4. TC04 package discovery
5. TC05 migration rule discovery/create/get
6. TC06 local file backup restore, one environment
7. TC07 server backup restore, one environment
8. TC08 create backup, download, restore-upload to target
9. TC09 local migration file check and execute
10. TC10 create migration from rule, download, check, execute
11. TC11-TC20 safety and failure cases

All cases run with `<SOURCE_ENV>=dev` and `<TARGET_ENV>=dev` for the current test round.
