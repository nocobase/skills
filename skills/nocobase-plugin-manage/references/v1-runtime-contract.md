# V1 Runtime Contract

## Purpose

Define a strict plugin-management contract using direct `nb pm` commands only.

## Command Contract

| Action | Command |
|---|---|
| inspect | `nb pm list` |
| enable | `nb pm enable <plugin>` |
| disable | `nb pm disable <plugin>` |

Rules:

- No wrapper scripts for `nb pm` execution.
- No docker command fallback.
- No runtime API fallback.
- No legacy ctl fallback.

## Invocation Pattern

Compact:

```text
Use $nocobase-plugin-manage inspect
Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc
Use $nocobase-plugin-manage disable @nocobase/plugin-api-doc
```

Structured:

```json
{
  "action": "enable",
  "plugins": ["@nocobase/plugin-api-doc"],
  "execution_mode": "safe",
  "verify": {
    "timeout_seconds": 90
  }
}
```

## Verification Rules

1. `safe` mode must capture pre-state with `nb pm list`.
2. `enable` success means target plugin is `enabled=true` in post-state.
3. `disable` success means target plugin is `enabled=false` in post-state.
4. On timeout, return `pending_verification` with last observed state.

## Output Envelope

Must include:

- `request`
- `commands`
- `pre_state`
- `post_state`
- `verification`
- `assumptions`
- `next_steps`
