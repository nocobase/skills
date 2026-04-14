---
name: nocobase-publish-manage
description: Use when users need to publish NocoBase applications across environments with precheck, auto-backup, backup-restore full coverage, or migration templates (`full_overwrite` / `structure_only`).
argument-hint: "[action: precheck|publish|verify|rollback] [method: backup_restore|migration] [migration-template: full_overwrite|structure_only] [channel: auto|local_cli|remote_api|remote_ssh_cli]"
allowed-tools: Bash, Read, Write, Grep, Glob
owner: platform-tools
version: 1.1.0
last-reviewed: 2026-04-14
risk-level: high
---

# Goal

Provide a deterministic release workflow for NocoBase applications with explicit risk gates, Node-only execution scripts, and machine-parseable verification output.

# Scope

- Handle release channel routing: `local_cli`, `remote_api`, `remote_ssh_cli`.
- Handle release method routing:
- `backup_restore`: full coverage restore into target.
- `migration`: differential release with template selection (`full_overwrite` / `structure_only`).
- Enforce pre-release checks:
- target/source environment context
- auth readiness
- plugin/runtime action readiness
- commercial capability (`plugin-migration-manager`) and required release plugin readiness
- Enforce release safety:
- auto-backup by default
- secondary confirmation for publish/rollback apply mode
- post-release verification and rollback guidance
- Provide resource-level adapters for release-critical plugin interfaces:
- backups (`backups:*` + `backupSettings:*`)
- migration manager (`migrationRules:*`, `migrationFiles:*`, `migrationLogs:*`)
- Keep release execution Node-only and hand off app environment lifecycle to `nocobase-env-bootstrap`.

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
| `channel` | no | `auto` | one of `auto/local_cli/remote_api/remote_ssh_cli` | "Should I force a channel?" |
| `migration_template` | conditional | none | required when `method=migration`; one of `full_overwrite/structure_only` | "For migration, should template be full_overwrite or structure_only?" |
| `source_env` | no | empty | valid env name when provided | "Which source env should be used?" |
| `target_env` | no | empty | valid env name when provided | "Which target env should be used?" |
| `source_url` | no | empty | valid HTTP(S) URL | "Do you want to force a source URL?" |
| `target_url` | no | empty | valid HTTP(S) URL | "Do you want to force a target URL?" |
| `source_token_env` | no | empty | env var name | "Which env var stores source token?" |
| `target_token_env` | no | `NOCOBASE_API_TOKEN` | env var name for remote API | "Which env var stores target token?" |
| `backup_auto` | no | `true` | boolean | "Should auto-backup be enabled?" |
| `backup_artifact` | rollback: yes | none | non-empty identifier | "Which backup artifact should rollback use?" |
| `apply` | no | `false` | boolean | "Should I execute now or only generate a plan?" |
| `confirm` | publish/rollback apply: yes | none | must be `confirm` | "Please type confirm to continue high-risk execution." |
| `base_dir` | no | current directory | existing path | "Which base directory should commands run in?" |
| `scope` | no | `project` | one of `project/global` | "Use project scope or global scope?" |
| `prefer` | no | `auto` | one of `auto/global/local` | "Prefer global ctl or local ctl?" |
| `ssh_host` | remote_ssh_cli: yes | empty | non-empty host | "What SSH host should be used?" |
| `ssh_path` | remote_ssh_cli: yes | empty | non-empty path | "What app path on SSH host should be used?" |

Rules:

- Default command entrypoint: `node ./publish-manage.mjs ...`.
- Local CLI wrapper: `node ./run-ctl.mjs ...`
- App environment lifecycle (`add/use/current/list`) must be handled by `$nocobase-env-bootstrap task=app-manage ...`, not by this skill.
- Migration template rule source is code-only:
- `migration-template-rules.mjs`
- If required inputs are missing, stop mutation and return blocker list.
- If user says "you decide", use defaults in this table.

# Mandatory Clarification Gate

- Max clarification rounds: `2`
- Max questions per round: `3`
- Before mutation (`publish`/`rollback` with apply):
- `method` and `channel` are resolved.
- target context is resolved (`target_url` or `target_env`/ssh target).
- auth is ready for `remote_api`.
- `migration_template` is explicitly set when `method=migration`.
- secondary confirmation is provided (`confirm`).
- If these checks are not met, stop and return blocker items.

# Workflow

1. Normalize and validate input.
2. Read environment inventory via CLI wrapper:
- `node ./run-ctl.mjs -- env list -s <scope>`.
3. If CLI detection fails, hand off to `$nocobase-env-bootstrap task=app-manage ...` for repair.
4. If target/source env is missing or unresolved, hand off to `$nocobase-env-bootstrap task=app-manage ...` and request explicit env selection before publish/rollback.
5. Resolve source/target URLs and release channel (`auto` allowed).
6. Run `pm list` for target env:
- detect commercial capability via `plugin-migration-manager`
- detect required release plugins (`migration_manager`, `backup_manager`)
- if plugin inactive/missing, hand off to `$nocobase-plugin-manage enable ...`
- if commercial capability is missing, prompt purchase URL and suggest app restart before rerun
7. Run precheck gates and produce `checks/blockers/warnings`.
8. Build command plan:
- `backup_restore`: backup + restore.
- `migration`: backup + generate migration + apply migration.
 - Resource execution must go through `publish-resource-adapter.mjs` templates (resource/API abstraction).
8. Execute plan only when `apply=true`; otherwise return dry-run plan.
9. Verify result and output `verification`:
- `passed`
- `failed`
- `pending_verification` (when plan-only)
10. Return structured output with next-step instructions.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [references/v1-runtime-contract.md](references/v1-runtime-contract.md) | implementing action/channel/method matrix | canonical behavior contract |
| [references/test-playbook.md](references/test-playbook.md) | verifying skill behavior | prompt-ready acceptance set |
| [publish-resource-adapter.mjs](publish-resource-adapter.mjs) | any release mutation/readback | unified resource templates for backup/migration operations |
| [run-ctl.mjs](run-ctl.mjs) | any ctl command execution | local/global nocobase-ctl resolver |
| [publish-manage.mjs](publish-manage.mjs) | publish orchestration | precheck/publish/verify/rollback entrypoint |

# Safety Gate

- High-risk actions:
- `publish` in apply mode
- `rollback` in apply mode
- `migration + full_overwrite` template

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
- Auto-backup behavior is explicit (`backup_auto`).
- Commands/actions are listed for reproducibility.
- Execution results include per-step status.
- Final `verification` state matches execution reality.
- Fallback hints are provided when failed.
- Next-step guidance is actionable.

# Minimal Test Scenarios

1. Precheck with migration/structure_only and complete target context.
2. Publish plan-only (`apply=false`) for backup_restore.
3. Publish apply without confirm is blocked.
4. Rollback without backup artifact is blocked.
5. Remote API channel without token env is blocked.
6. Remote SSH channel without host/path is blocked.
7. Migration overwrite returns high-risk warning.

# Output Contract

Final response must include:

- `request` (action/method/channel/migration_template/apply)
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

# References

- [NocoBase Documentation](https://docs.nocobase.com/): official product and plugin behavior reference. [verified: 2026-04-14]
- [NocoBase Commercial](https://www.nocobase.com/en/commercial): official commercial purchase and activation guidance. [verified: 2026-04-14]
- [Runtime Contract](references/v1-runtime-contract.md): action/channel/method behavior map.
- [Test Playbook](references/test-playbook.md): acceptance prompts and expected assertions.
- [run-ctl Resolver](run-ctl.mjs): skill-local ctl runtime resolver.
- [Release Resource Adapter](publish-resource-adapter.mjs): resource operation templates and adapter helpers.
- [nocobase-env-bootstrap](../nocobase-env-bootstrap/SKILL.md): authoritative app environment lifecycle skill (`task=app-manage`).
- [Release Runtime](publish-manage.mjs): skill-local release orchestration entrypoint.
- [Migration Template Rules](migration-template-rules.mjs): template enum, risk checks, and command mapping.

