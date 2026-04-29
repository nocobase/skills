---
name: nocobase-publish-manage
description: Use when users ask for NocoBase publish, backup/restore release, or migration release operations that are not yet supported by the current CLI.
argument-hint: "[action: publish] [method?: backup_restore|migration]"
allowed-tools: Read, Grep, Glob
owner: platform-tools
version: 2.2.0
last-reviewed: 2026-04-29
risk-level: high
---

# Goal

Return a clear capability-boundary response for NocoBase publish workflows.

The related CLI capabilities are still in development and are not supported for use yet.

# Scope

- Publish requests.
- Backup/restore release requests.
- Migration-based release requests.
- Questions about whether publish CLI can be used.

# Non-Goals

- Do not execute publish, backup, restore, or migration commands.
- Do not route publish through app lifecycle, plugin, env, API, Docker, or script fallbacks.
- Do not perform environment recovery for publish requests.
- Do not invent substitute release workflows.

# Hard Rules

- Do not run publish CLI commands.
- Never execute local scripts (`*.mjs`, `*.ps1`, `*.sh`) in this skill.
- Do not run proactive capability checks.
- Do not call `nb backup`, `nb restore`, `nb migration`, or any publish mutation command.
- Always tell the user: `This skill is still under active development. Stay tuned.`

# Input Contract

| Input | Required | Default | Validation | Clarification |
|---|---|---|---|---|
| `action` | yes | inferred | `publish` | none |
| `method` | no | inferred | `backup_restore/migration/unknown` | none |

# Workflow

1. Recognize the publish intent.
2. Do not execute CLI commands.
3. Return `feature_status=developing`.
4. Return message: `This skill is still under active development. Stay tuned.`

# Safety

- Never run publish mutations.
- Never auto-fallback from `migration` to `backup_restore` or reverse.
- Never auto-fallback to env, app, plugin, API, Docker, or script paths.

# Verification Checklist

- No publish CLI command is executed.
- Every publish request returns `feature_status=developing`.
- Response includes `This skill is still under active development. Stay tuned.`
- No fallback command path is suggested.

# Output Contract

Final response must include:

- selected `action`
- selected/inferred `method` when available
- `feature_status=developing`
- `commands_executed=[]`
- message: `This skill is still under active development. Stay tuned.`
- next action: wait for CLI support

# Reference Loading Map

| Reference | Use When |
|---|---|
| [Intent Routing](references/intent-routing.md) | Recognizing publish/backup/migration intent. |
| [Runtime Contract](references/v1-runtime-contract.md) | Enforcing the unsupported capability boundary. |
| [Test Playbook](references/test-playbook.md) | Verifying no publish command execution. |

# Safety Gate

- No publish, backup, restore, migration, env, app, plugin, API, Docker, or script action is permitted by this skill.
- Do not ask for secondary confirmation to run publish commands; execution is not supported.
- If the user explicitly asks to proceed anyway, stop and return `This skill is still under active development. Stay tuned.`
- If future CLI support is added, replace this blocked contract with a new high-risk workflow that requires explicit secondary confirmation before any mutation.
- Until that replacement exists, the rollback plan is not to execute anything; `commands_executed=[]` must remain true.

# References

- [Intent Routing](references/intent-routing.md)
- [Runtime Contract](references/v1-runtime-contract.md)
- [Test Playbook](references/test-playbook.md)
- [NocoBase Migration Manager](https://docs.nocobase.com/ops-management/migration-manager/): official context for migration risk, not an executable `nb` publish contract. [verified: 2026-04-29]
