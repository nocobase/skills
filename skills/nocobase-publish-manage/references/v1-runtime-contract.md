# V1 Runtime Contract

## Purpose

Define deterministic release orchestration for `nocobase-publish-manage` with Node-only scripts inside this skill directory.

## Runtime Entry Points

- `node ./scripts/publish-manage.mjs <action> ...`
- `nb <command> [subcommand ...] [flags ...]`
- `$nocobase-env-bootstrap task=app-manage ...` (environment lifecycle only)

## Action Matrix

| Action | Primary Goal | Requires Mutation | Output Focus |
|---|---|---|---|
| `precheck` | validate context and risk gates | no | checks/blockers/warnings |
| `publish` | execute release flow | yes (when `apply=true`) | plan + execution steps |
| `verify` | post-release readback | optional | runtime health/readback |
| `rollback` | restore by backup artifact | yes (when `apply=true`) | rollback steps + result |

## Channel Matrix

| Channel | Main Transport | Typical Use |
|---|---|---|
| `local_cli` | direct `nb` CLI | local app / local operator |
| `remote_api` | API action routes | remote app API reachable |
| `remote_ssh_cli` | `ssh` + app CLI | remote host with shell access |
| `auto` | heuristic resolution | default mode |

Auto-resolution order:

1. explicit channel (if provided)
2. SSH host exists -> `remote_ssh_cli`
3. target URL local host -> `local_cli`
4. target URL remote host -> `remote_api`
5. fallback -> `local_cli`

## Method Matrix

| Method | Publish Steps |
|---|---|
| `backup_restore` | source list latest backups (gate) -> source download backup file -> target create backup (optional auto) -> target upload/restore |
| `migration` | source create migration rule -> source generate migration file (ruleId required) -> source download package -> target create backup (optional auto) -> target check migration file -> target run migration task |

Intent routing:

- See [intent-routing.md](intent-routing.md) for deterministic keyword routing and conflict handling.
- `restore` intent must lock `backup_restore`.
- `migration` intent must lock `migration`.
- `publish` intent must require method choice.

Migration template presets:

- `schema_only_all`: user-defined=`schema-only`, system=`schema-only`
- `user_overwrite_only`: user-defined=`overwrite`, system=`schema-only`
- `system_overwrite_only`: user-defined=`schema-only`, system=`overwrite-first`
- `full_overwrite`: user-defined=`overwrite`, system=`overwrite-first`

User-visible method labels:

- `backup_restore`: `Use existing backup package`
- `migration`: `Create new release package`

## Execution Context Contract

For publish actions, every planned/executed step must carry explicit context:

- `exec_context`: `source` or `target`
- `exec_env`: resolved env name for the step
- `exec_base_url`: resolved API base URL for the step

Execution order for mutation flows:

1. finish source-side package creation/download
2. then execute target-side backup/check/apply

## Safety Rules

1. `publish` / `rollback` in apply mode require `--confirm confirm`.
2. `migration` publish requires explicit template (`schema_only_all`, `user_overwrite_only`, `system_overwrite_only`, or `full_overwrite`).
3. `rollback` requires explicit backup artifact.
4. remote API publish requires valid token env.
5. remote SSH flow requires host + path.
6. CLI detection failure must hand off to `nocobase-env-bootstrap` for repair.
7. If `pm list` cannot detect enabled `plugin-migration-manager`, block publish and provide guidance:
   - purchase commercial edition
   - or restart target app if already purchased
8. Required plugins are:
   - `migration_manager` (`@nocobase/plugin-migration-manager`)
   - `backup_manager` (`@nocobase/plugin-backups`)
   If missing or inactive, return plugin activation action.
9. For `publish + backup_restore + apply=true`, user must choose one source backup artifact before execution starts. Runtime returns latest 5 source candidates and blocks execution when `--backup-artifact` is missing.
10. For `publish + apply=true`, method selection is a hard gate. Runtime requires `--publish-method-confirm <same-as--method>` before execution starts.
11. For `publish + method=migration + apply=true`, template preset selection is a hard gate. Runtime must return `action_required.type=choose_migration_template` when template is missing.
12. For migration publish, `migration_rules_create` payload must set:
    - `rules.userDefined.globalRule`
    - `rules.systemDefined.globalRule`
    - `rules.userDefined.enableIndependentRules=false`
    - `rules.systemDefined.enableIndependentRules=false`
13. For migration publish, `migration_rules_create` must succeed and provide rule ID before `migration_files_create` runs.
14. Any `action_required` choice gate (`choose_publish_method`, `choose_backup_artifact`, `choose_migration_template`) must be treated as user-input required and must not be auto-resolved by orchestration.

## Verification States

- `passed`: checks passed and apply execution succeeded
- `failed`: blockers or execution failure
- `pending_verification`: dry-run plan generated (`apply=false`)

## Output Envelope

`scripts/publish-manage.mjs` returns JSON with:

- `request` (includes `publish_method_confirm`)
- `channel`
- `target_resolution`
- `pre_state`
- `checks`, `blockers`, `warnings`
- `plugin_checks`
- `backup_candidates`
- `action_required`
- `backup_artifact`
- `commands_or_actions`
- `execution`
- `verification`
- `assumptions`
- `fallback_hints`
- `next_steps`

Execution summary includes tracked IDs/files:

- `latest_backup_artifact`
- `latest_backup_downloaded_file`
- `latest_migration_rule_id`
- `latest_migration_file`
- `latest_migration_downloaded_file`
- `latest_migration_task_id`
- `latest_restore_task_id`

## Resource Adapter Coverage

`scripts/publish-resource-adapter.mjs` provides operation templates for:

- backups plugin:
  - create/list/destroy/restore/upload/download
  - task status / restore status / app info
  - backup settings get/update
- migration-manager plugin:
  - migration rules list/get/create/update/destroy/listCollections
  - migration files list/get/create/destroy/download/downloadMigrationSql/getMigrationProcess/check/checkEnvTexts/checkDataConflicts/runTask
  - migration logs list/get/destroy/download
- legacy compatibility aliases:
  - `migration_generate`
  - `migration_up`

## Notes

- Runtime route names for backup/migration can vary across plugin versions.
- Use precheck output plus runtime route attempts to confirm final route names in your environment.
- Migration template policy is maintained in `../scripts/migration-template-rules.mjs`.
- Resource operation templates and adapter rules are maintained in `../scripts/publish-resource-adapter.mjs`.
