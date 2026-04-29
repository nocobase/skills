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

Current status against the latest local CLI:

- The current `nb` CLI in this repo does not expose top-level `backup`, `restore`, or `migration` commands.
- Treat publish operations as capability-gated. Always verify with `nb --help` first.
- If the required publish command family is absent, stop and return the capability-boundary message instead of fabricating a fallback command.

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
Blocked on current CLI unless a newer `nb` build restores top-level `backup` / `restore`.
```

Rules:

- if the CLI does not expose `backup` / `restore`, stop immediately with the capability-boundary message
- require `confirm=confirm` before `restore` when this command family becomes available again

## publish with `migration`

Recommended sequence:

```bash
Blocked on current CLI unless a newer `nb` build restores top-level `migration` commands.
```

Rules:

- if the CLI does not expose `migration`, stop immediately with the capability-boundary message
- if `rule_id` or `migration_file` is missing after future support lands, stop and ask the user to choose the missing input
- require `confirm=confirm` before `migration run`

# Safety

- Never run publish mutations without `confirm=confirm`.
- Never auto-fallback from `migration` to `backup_restore` or reverse.
- When CLI reports command capability missing, block execution and return developing status.

# Verification Checklist

- Skill does not reference local script entrypoints.
- Skill executes publish command directly without precheck.
- Missing commands produce `developing` response and no mutation command runs.
- Backup restore flow is currently blocked unless a future `nb` build reintroduces the required commands.
- Migration flow is currently blocked unless a future `nb` build reintroduces the required commands.

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
