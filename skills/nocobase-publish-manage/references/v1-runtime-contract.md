# Runtime Contract (v2)

## Scope

This skill is nb CLI only and follows:

- `nb backup list`
- `nb restore`
- `nb migration rule add`
- `nb migration generate`
- `nb migration run`

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
nb backup list --env <source_env>
nb restore <backup_file> --env <target_env>
```

### migration

```bash
nb migration rule add --env <source_env>
nb migration generate <rule_id> --env <source_env>
nb migration run <migration_file> --env <target_env>
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
