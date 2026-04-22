---
name: nocobase-publish-manage
description: Use when users need to publish NocoBase applications across environments with strict precheck gates, hard method confirmation, backup artifact selection, and migration template presets (`schema_only_all` / `user_overwrite_only` / `system_overwrite_only` / `full_overwrite`).
argument-hint: "[action: precheck|publish|verify|rollback] [method: backup_restore|migration] [migration-template: schema_only_all|user_overwrite_only|system_overwrite_only|full_overwrite] [channel: auto|local_cli|remote_api|remote_ssh_cli]"
allowed-tools: Bash, Read, Write, Grep, Glob
owner: platform-tools
version: 1.3.0
last-reviewed: 2026-04-15
risk-level: high
---

# Goal

Provide a deterministic release workflow for NocoBase applications with explicit risk gates, Node-only execution scripts, and machine-parseable verification output.

# Scope

- Handle release channel routing: `local_cli`, `remote_api`, `remote_ssh_cli`.
- Handle release method routing:
  - `backup_restore`: source backup artifact download + target upload restore.
  - `migration`: source rule create/generate/download + target check/up.
- Enforce pre-release checks:
  - source/target environment presence and CLI readiness
  - target commercial capability via `plugin-migration-manager`
  - required plugin readiness (`migration_manager`, `backup_manager`)
- Enforce release safety:
  - `publish`/`rollback` apply confirmation (`--confirm confirm`)
  - method confirmation hard gate (`--publish-method-confirm`)
  - backup artifact selection hard gate for `backup_restore`
  - auto-backup by default before target mutation
- Provide resource-level adapters for release-critical plugin interfaces:
  - backups (`backups:*` + `backupSettings:*`)
  - migration manager (`migrationRules:*`, `migrationFiles:*`, `migrationLogs:*`)
- Keep release execution Node-only and hand off app environment lifecycle to `nocobase-env-bootstrap`.

User-facing publish method copy (internal key -> display text):

- `backup_restore` -> `Use existing backup package`
- `migration` -> `Create new release package`

Migration template presets (independent rules are always disabled):

- `schema_only_all` -> user-defined=`schema-only`, system=`schema-only`
- `user_overwrite_only` -> user-defined=`overwrite`, system=`schema-only`
- `system_overwrite_only` -> user-defined=`schema-only`, system=`overwrite-first`
- `full_overwrite` -> user-defined=`overwrite`, system=`overwrite-first`

# Non-Goals

- Do not modify NocoBase server source code.
- Do not assume fixed backup/migration action names across every plugin version.
- Do not execute destructive actions silently.
- Do not hide partial failures as success.
- Do not rely on shell scripts (`.sh`/`.ps1`) for release flow.

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `action` | yes | none | one of `precheck/publish/verify/rollback` | "Run precheck, publish, verify, or rollback?" |
| `method` | yes | none | one of `backup_restore/migration` | "Use backup_restore or migration?" |
| `publish_method_confirm` | conditional | empty | required when `action=publish` and `apply=true`; must equal `method` | "Please confirm release method with --publish-method-confirm <same-as-method>." |
| `channel` | no | `auto` | one of `auto/local_cli/remote_api/remote_ssh_cli` | "Should I force a channel?" |
| `migration_template` | conditional | none | required when migration publish executes; one of `schema_only_all/user_overwrite_only/system_overwrite_only/full_overwrite` | "For migration, choose one preset: schema_only_all, user_overwrite_only, system_overwrite_only, or full_overwrite." |
| `source_env` | no | `local` (when source url missing) | valid env name when provided | "Which source env should be used?" |
| `target_env` | no | `test` (when target url missing) | valid env name when provided | "Which target env should be used?" |
| `source_url` | no | empty | valid HTTP(S) URL | "Do you want to force a source URL?" |
| `target_url` | no | empty | valid HTTP(S) URL | "Do you want to force a target URL?" |
| `source_token_env` | no | empty | env var name | "Which env var stores source token?" |
| `target_token_env` | no | `NOCOBASE_API_TOKEN` | env var name for remote API | "Which env var stores target token?" |
| `backup_auto` | no | `true` | boolean | "Should auto-backup be enabled?" |
| `backup_artifact` | conditional | none | required for `rollback`; also required for `publish + backup_restore + apply=true` | "Which backup artifact should be used?" |
| `apply` | no | `false` | boolean | "Should I execute now or only generate a plan?" |
| `confirm` | publish/rollback apply: yes | none | must be `confirm` | "Please type confirm to continue high-risk execution." |
| `base_dir` | no | current directory | existing path | "Which base directory should commands run in?" |
| `scope` | no | `project` | one of `project/global` | "Use project scope or global scope?" |
| `ssh_host` | remote_ssh_cli: yes | empty | non-empty host | "What SSH host should be used?" |
| `ssh_path` | remote_ssh_cli: yes | empty | non-empty path | "What app path on SSH host should be used?" |

Rules:

- Default command entrypoint: `node ./scripts/publish-manage.mjs ...`.
- Local CLI execution is direct `nb ...` (no wrapper script).
- App environment lifecycle (`add/use/current/list`) must be handled by `$nocobase-env-bootstrap task=app-manage ...`, not by this skill.
- Migration template policy source is code-only: `scripts/migration-template-rules.mjs`.
- If required inputs are missing, stop mutation and return blocker list.
- If user says "you decide", use defaults in this table.

# Mandatory Clarification Gate

- Max clarification rounds: `2`.
- Max questions per round: `3`.
- Before mutation (`publish`/`rollback` with apply):
  - `method` and `channel` are resolved
  - source and target context are resolved (`source_url/source_env`, `target_url/target_env` or ssh target)
  - auth is ready for `remote_api`
  - `migration_template` is explicitly set when `method=migration`
    - when missing, runtime must return `action_required.type=choose_migration_template` with 4 presets
  - `publish_method_confirm` equals `method` when `action=publish`
  - `backup_artifact` is selected when `action=publish + method=backup_restore`
  - secondary confirmation is provided (`confirm`)
- If these checks are not met, stop and return blocker items plus `action_required`.

Anti-inference policy:

- Do not infer publish method/template/artifact from generic publish requests.
- For ambiguous input such as "publish local to 19000", run precheck only and ask user to choose.
- If runtime returns any `action_required` choice gate, stop and wait for user response.

Deterministic keyword routing:

- Follow [references/intent-routing.md](references/intent-routing.md) exactly.
- Conflict (`restore` + `migration` in one request) must stop execution and ask user to choose one intent.

# Workflow

1. Normalize and validate input.
2. Read environment inventory via direct CLI: `nb env list -s <scope>`.
3. If CLI env inventory fails, hand off to `$nocobase-env-bootstrap task=app-manage ...` for repair.
4. Check source/target env existence and run CLI update checks for both envs.
5. If env is missing or CLI check fails, hand off to `$nocobase-env-bootstrap task=app-manage ...`.
6. Resolve source/target URLs and release channel (`auto` allowed).
7. Run `pm list` for target env:
   - detect commercial capability via `plugin-migration-manager`
   - detect required release plugins (`migration_manager`, `backup_manager`)
   - if plugin inactive/missing, hand off to `$nocobase-plugin-manage enable ...`
   - if commercial capability missing, return purchase URL and restart guidance
8. Run method-specific gates:
   - `publish + apply=true`: enforce `--publish-method-confirm <same-as--method>`
   - `publish + method=backup_restore + apply=true`: query latest 5 source backup artifacts and enforce `--backup-artifact`
   - `publish + method=migration + apply=true`: enforce migration preset selection (`--migration-template`)
   - migration template safety checks (`schema_only_all` / `user_overwrite_only` / `system_overwrite_only` / `full_overwrite`)
9. Build command plan (with explicit `exec_context`):
   - `backup_restore` publish:
     - source: `backup_download`
     - target: `backup_create` (if `backup_auto=true`)
     - target: `backup_upload`
   - `migration` publish:
     - source: `migration_rules_create`
     - source: `migration_generate` (`ruleIdRef=latest_migration_rule`)
     - source: `migration_files_download`
     - target: `backup_create` (if `backup_auto=true`)
     - target: `migration_files_check`
     - target: `migration_up`
10. Execute plan only when `apply=true`; otherwise return dry-run plan.
11. Verify result and output `verification`:
    - `passed`
    - `failed`
    - `pending_verification` (when plan-only)
12. Return structured output with next-step instructions.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [references/v1-runtime-contract.md](references/v1-runtime-contract.md) | implementing action/channel/method matrix | canonical behavior contract |
| [references/intent-routing.md](references/intent-routing.md) | mapping user keywords to intent/method flow | deterministic anti-inference routing |
| [references/test-playbook.md](references/test-playbook.md) | verifying skill behavior | prompt-ready acceptance set |
| [publish-resource-adapter.mjs](scripts/publish-resource-adapter.mjs) | any release mutation/readback | unified resource templates for backup/migration operations |
| [publish-manage.mjs](scripts/publish-manage.mjs) | publish orchestration | precheck/publish/verify/rollback entrypoint |

# Safety Gate

High-risk actions:

- `publish` in apply mode
- `rollback` in apply mode
- `migration` with overwrite templates (`user_overwrite_only`, `system_overwrite_only`, `full_overwrite`)

Mandatory hard gates before publish apply:

- `--confirm confirm`
- `--publish-method-confirm <same-as--method>`
- `--backup-artifact <name>` for `backup_restore`

Secondary confirmation template:

- "Confirm execution: `{{action}}` with method `{{method}}` on target `{{target}}`. Impact: target data may be overwritten or restored. Reply `confirm` to continue."

Rollback guidance:

- Trigger rollback when `publish` fails after partial write.
- Rollback steps:
  - identify latest valid backup artifact
  - execute rollback with explicit confirmation
  - run `verify` action and compare key health signals

# Change Window

- Prefer a maintenance window for publish/rollback apply mode.
- Avoid long-running data writes during business peak periods.

# Approval Chain

- Require business owner approval before first production rollout.
- Require technical owner approval before `migration full_overwrite`.

# Rollback Drill

- Dry-run rollback plan before production release.
- Keep at least one known-good backup artifact ID per target.

# Post-Change Audit

- Record release request, executed steps, and verification output.
- Keep blocker/warning history for future release hardening.

# Verification Checklist

- Input contract is complete for selected action.
- Channel resolution is explicit in output.
- Precheck reports `checks`, `blockers`, and `warnings`.
- Publish/rollback apply mode enforces `confirm`.
- Publish apply enforces method hard gate (`publish_method_confirm`).
- Backup restore publish enforces artifact selection gate.
- Auto-backup behavior is explicit (`backup_auto`).
- Commands/actions are listed for reproducibility.
- Execution results include per-step status and `exec_context` (`source`/`target`).
- Final `verification` state matches execution reality.
- Fallback hints are provided when failed.
- Next-step guidance is actionable.

# Minimal Test Scenarios

1. Precheck with migration/schema_only_all and complete source+target context.
2. Publish plan-only (`apply=false`) for `backup_restore`.
3. Publish apply without `--confirm confirm` is blocked.
4. Publish apply without `--publish-method-confirm` is blocked.
5. Publish apply with `backup_restore` but without `--backup-artifact` is blocked and returns latest 5 source candidates.
6. Rollback without backup artifact is blocked.
7. Remote API channel without token env is blocked.
8. Remote SSH channel without host/path is blocked.
9. Migration overwrite returns high-risk warning.

# Output Contract

Final response must include:

- `request` (action/method/publish_method_confirm/channel/migration_template/apply)
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

# References

- [NocoBase Documentation](https://docs.nocobase.com/): official product and plugin behavior reference. [verified: 2026-04-15]
- [NocoBase Commercial](https://www.nocobase.com/en/commercial): official commercial purchase and activation guidance. [verified: 2026-04-15]
- [Runtime Contract](references/v1-runtime-contract.md): action/channel/method behavior map.
- [Test Playbook](references/test-playbook.md): acceptance prompts and expected assertions.
- [Release Resource Adapter](scripts/publish-resource-adapter.mjs): resource operation templates and adapter helpers.
- [nocobase-env-bootstrap](../nocobase-env-bootstrap/SKILL.md): authoritative app environment lifecycle skill (`task=app-manage`).
- [Release Runtime](scripts/publish-manage.mjs): skill-local release orchestration entrypoint.
- [Migration Template Rules](scripts/migration-template-rules.mjs): template enum, risk checks, and command mapping.
