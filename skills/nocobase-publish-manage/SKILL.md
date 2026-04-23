---
name: nocobase-publish-manage
description: Use when users need NocoBase publish operations via nb CLI backup/restore or migration commands.
argument-hint: "[action: publish] [method: backup_restore|migration] [source-env] [target-env]"
allowed-tools: Bash, Read, Write, Grep, Glob
owner: platform-tools
version: 2.1.0
last-reviewed: 2026-04-23
risk-level: high
---

# Goal

Follow the new publish direction and execute release operations with direct `nb` CLI commands only.

Supported scenarios:

- Single-environment backup restore
- Cross-environment backup restore
- Cross-environment migration

# Direction Source

- Feishu wiki: `https://nocobase.feishu.cn/wiki/M0knwAvYSiAouUk1ZHAcduDjnmh`

Command examples from that direction:

- `nb backup list --env <env>`
- `nb restore <file-name> --env <env>`
- `nb migration rule add --env <env>`
- `nb migration generate <ruleId> --env <env>`
- `nb migration run <file-name> --env <env>`

# Hard Rules

- Run `nb` commands only.
- Never execute local scripts (`*.mjs`, `*.ps1`, `*.sh`) in this skill.
- Prefer executing user-requested publish commands first; use `--help` commands when user asks diagnostics/help output or command discovery is needed.
- Execute requested publish commands directly, then follow CLI response.
- If CLI returns unknown command / not supported, stop and tell user these features are still in development.

# Input Contract

| Input | Required | Default | Validation | Clarification |
|---|---|---|---|---|
| `action` | yes | inferred | `publish` | "Run publish workflow now?" |
| `method` | for `action=publish` | none | one of `backup_restore/migration` | "Use backup_restore or migration?" |
| `source_env` | conditional | none | non-empty env name | "Which source env should be used?" |
| `target_env` | conditional | none | non-empty env name | "Which target env should be used?" |
| `backup_file` | for backup restore publish | none | non-empty backup file id/name | "Which backup file should be restored?" |
| `rule_id` | for migration publish | none | non-empty migration rule id | "Which migration rule id should be used?" |
| `migration_file` | for migration run | generated/selected | non-empty file id/name | "Which migration package should be run?" |
| `confirm` | publish | none | must be `confirm` | "Please type confirm to continue publish." |

# Unsupported Command Handling

Do not run proactive capability checks.

If command output indicates unknown command / not supported (for example `Unknown command: \`backup\``), return:

- `feature_status=developing`
- missing command list
- message: `Current nb CLI does not support this publish feature yet. It is still in development.`

Do not continue to subsequent mutation commands when `feature_status=developing`.

# Workflow

## publish with `backup_restore`

Single or cross environment are both supported by env arguments.

Recommended sequence:

```bash
nb backup list --env <source_env>
nb restore <backup_file> --env <target_env>
```

Rules:

- if `backup_file` is missing, stop after `backup list` and ask user to choose one file
- require `confirm=confirm` before `restore`

## publish with `migration`

Recommended sequence:

```bash
nb migration rule add --env <source_env>
nb migration generate <rule_id> --env <source_env>
nb migration run <migration_file> --env <target_env>
```

Rules:

- if `rule_id` missing, stop and ask user to create/select rule first
- if `migration_file` missing after generate step, stop and ask user to confirm package
- require `confirm=confirm` before `migration run`

# Safety

- Never run publish mutations without `confirm=confirm`.
- Never auto-fallback from `migration` to `backup_restore` or reverse.
- When CLI reports command capability missing, block execution and return developing status.

# Verification Checklist

- Skill does not reference local script entrypoints.
- Skill executes publish command directly without precheck.
- Missing commands produce `developing` response and no mutation command runs.
- Backup restore flow uses `nb backup list` + `nb restore`.
- Migration flow uses `nb migration rule add/generate/run`.

# Output Contract

Final response must include:

- selected `action` and `method`
- `feature_status` (`available` or `developing`)
- `missing_commands` (if any)
- commands executed (or blocked reason)
- relevant CLI outputs (especially failure/hint lines)
- next action

# References

- [Intent Routing](references/intent-routing.md)
- [Runtime Contract](references/v1-runtime-contract.md)
- [Test Playbook](references/test-playbook.md)
- Feishu wiki direction: `https://nocobase.feishu.cn/wiki/M0knwAvYSiAouUk1ZHAcduDjnmh`
