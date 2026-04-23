---
name: nocobase-plugin-manage
description: Manage NocoBase plugins with direct `nb pm` commands only. No docker/api/manual fallback chains are allowed in this skill.
allowed-tools: Bash, Read, Grep, Write
metadata:
  owner: platform-tools
  version: 2.0.0
  last-reviewed: 2026-04-21
  risk-level: medium
---

# Goal

Provide a deterministic plugin workflow using **only** direct `nb pm` commands:

- `nb pm list`
- `nb pm enable`
- `nb pm disable`

This skill must not route plugin operations through wrapper scripts or fallback channels.

# Scope

- Inspect plugin inventory/state from CLI runtime (`nb pm list`).
- Enable plugins with `nb pm enable <plugin>`.
- Disable plugins with `nb pm disable <plugin>`.
- Always perform readback with `nb pm list` after writes.

# Non-Goals

- Do not use `docker compose exec ... yarn nocobase pm ...`.
- Do not use API action routes (`pm:list`, `pm:enable`, `pm:disable`) as fallback.
- Do not use legacy ctl commands or wrapper scripts for plugin operations.
- Do not support `install/remove` in this skill version.

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `action` | yes | none | one of `inspect/enable/disable` | "Which action should I run: inspect, enable, or disable?" |
| `plugins` | enable/disable: yes | none | non-empty string array | "Which plugin(s) should be changed?" |
| `base_dir` | no | current working directory | existing path | "Which directory should `nb` commands run in?" |
| `execution_mode` | no | `safe` | one of `safe/fast` | "Use safe mode or fast mode?" |
| `verify.timeout_seconds` | no | `90` | integer `10..600` | "What verification timeout should I use?" |

Rules:

- Keep compact invocation: `Use $nocobase-plugin-manage <action> [plugin...]`.
- `safe` mode requires pre-state + post-state readback.
- If user says "you decide", use defaults above.

# Mandatory Clarification Gate

- Max clarification rounds: `2`
- Max questions per round: `3`
- Before `enable/disable`, `plugins` must be resolved.
- If required inputs are missing, stop mutation and ask.

# Workflow

1. Parse request and normalize to `inspect/enable/disable`.
2. Capture pre-state via `nb pm list` when `execution_mode=safe`.
3. Execute action with direct command:
- `inspect`: `nb pm list`
- `enable`: `nb pm enable <plugin>`
- `disable`: `nb pm disable <plugin>`
4. Readback polling via `nb pm list` until timeout.
5. Return structured output.

# Safety Gate

- High-impact actions:
- disable auth/ACL/system-critical plugins
- batch disable in shared environments
- Secondary confirmation template:
- "Confirm execution: `{{action}}` for `{{plugins}}`. Type `confirm` to continue."
- Rollback guidance:
- failed disable: run `nb pm enable <plugin>`
- failed enable: run `nb pm disable <plugin>` (only when user requests rollback)

# Verification Checklist

- `action` and `plugins` resolved.
- Command path uses direct `nb pm` only.
- Pre-state captured in `safe` mode.
- Post-state readback captured.
- `enable` => plugin shows `enabled=true`.
- `disable` => plugin shows `enabled=false`.
- Timeout reported as `pending_verification`.

# Minimal Test Scenarios

1. `inspect` uses `nb pm list`.
2. `enable` uses `nb pm enable` then readback by `nb pm list`.
3. `disable` uses `nb pm disable` then readback by `nb pm list`.
4. Missing plugin input blocks mutation with clarification.

# Output Contract

Always return:

- `request`
- `commands`
- `pre_state`
- `post_state`
- `verification` (`passed|failed|pending_verification`)
- `assumptions`
- `next_steps`

# References

- [V1 Runtime Contract](references/v1-runtime-contract.md)
- [Test Playbook](references/test-playbook.md)
