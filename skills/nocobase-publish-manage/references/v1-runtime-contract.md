# Runtime Contract (v2)

## Scope

This skill is nb CLI only.

Current compatibility note:

- The current local `nb` CLI does not expose top-level `backup`, `restore`, or `migration` commands.
- Do not emit those commands unless a newer CLI build explicitly restores them in `nb --help`.

## Execution Rule

Execute target commands directly and follow CLI output.
`--help` commands are available when diagnostics/help output or command discovery is needed.

When any required command is unavailable (`Unknown command`), runtime must return:

- `feature_status: developing`
- `missing_commands: [...]`
- no subsequent mutation command execution

## Publish Execution

### backup_restore

```bash
Blocked on current CLI: top-level `nb backup` / `nb restore` commands are absent.
```

### migration

```bash
Blocked on current CLI: top-level `nb migration` commands are absent.
```

## Mutation Gate

Before running `restore` or `migration run`, require:

- `confirm=confirm`

## Output Fields

Runtime response should include:

- `action`
- `method`
- `feature_status` (`available|developing`)
- `missing_commands`
- `commands_executed`
- `blocked_reason` (if blocked)
- `next_action`
