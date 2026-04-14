# V1 Runtime Contract

## Purpose

Define deterministic release orchestration for `nocobase-publish-manage` with Node-only scripts in this skill folder.

## Runtime Entry Points

- `node ./publish-manage.mjs <action> ...`
- `node ./run-ctl.mjs -- <nocobase-ctl-args>`
- `$nocobase-env-bootstrap task=app-manage ...` (for environment lifecycle only)

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
| `local_cli` | `run-ctl.mjs` wrapper | local app / local operator |
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

| Method | Steps |
|---|---|
| `backup_restore` | backup target -> restore target |
| `migration` | backup target -> generate migration on source -> download package from source -> upload/check on target -> run task on target |

Migration template:

- `full_overwrite`: high-impact replace behavior
- `structure_only`: structure-only migration path

## Safety Rules

1. `publish` / `rollback` in apply mode require `--confirm confirm`.
2. `migration` requires explicit template (`full_overwrite` or `structure_only`).
3. `rollback` requires explicit backup artifact.
4. remote API publish requires valid token env.
5. remote SSH flow requires host + path.
6. CLI detection failure must hand off to `nocobase-env-bootstrap` for repair.
7. If `pm list` cannot detect enabled `plugin-migration-manager` capability, block publish and provide guidance: purchase commercial edition or restart target app if already purchased.
8. Required plugins for release are `migration_manager` (`@nocobase/plugin-migration-manager`) and `backup_manager` (`@nocobase/plugin-backups`); if missing or inactive, hand off to `nocobase-plugin-manage enable ...`.

## Verification States

- `passed`: checks passed and apply execution succeeded
- `failed`: blockers or execution failure
- `pending_verification`: dry-run plan generated (`apply=false`)

## Output Envelope

`publish-manage.mjs` returns JSON with:

- `request`
- `channel`
- `target_resolution`
- `pre_state`
- `checks`, `blockers`, `warnings`
- `plugin_checks`
- `action_required`
- `backup_artifact`
- `commands_or_actions`
- `execution`
- `verification`
- `assumptions`
- `fallback_hints`
- `next_steps`

For release `commands_or_actions[*]` and `execution.steps[*]`, each step includes:

- `exec_context`: `source` or `target`
- `exec_env`: resolved env name for the step
- `exec_base_url`: resolved API base URL for the step

## Resource Adapter Coverage

`publish-resource-adapter.mjs` provides operation templates for:

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

- Runtime route names for backup/migration may vary across plugin versions.
- Use precheck output plus target runtime action list to confirm final route names in your environment.
- Migration template policy is maintained in `../migration-template-rules.mjs`.
- Resource operation templates and adapter rules are maintained in `../publish-resource-adapter.mjs`.

