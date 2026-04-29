# Runtime Contract

## Scope

This skill handles publish intent only as an unsupported capability boundary.

## Current Status

Publish-related CLI capabilities are still in development.

Do not execute:

- `nb backup`
- `nb restore`
- `nb migration`
- any publish mutation command

## Runtime Rule

For every publish request:

- do not execute CLI commands
- return `feature_status=developing`
- return `commands_executed=[]`
- return message `This skill is still under active development. Stay tuned.`

## Output Fields

Runtime response should include:

- `action`
- `method`
- `feature_status`
- `commands_executed`
- `message`
- `next_action`
