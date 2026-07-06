---
title: "Response Message"
description: "Use in synchronous pre-action or custom-action flows to return a user-facing message to the client after validation or processing."
---

# Response Message

## Node Type

`response-message`

## Node Description
Configures the message content returned to the client when a request ends (only available for intercept-type synchronous workflows).

## Business Scenario Example
Returning an "Operation Successful/Failed" prompt in an intercept-type workflow.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| message | string | None | No | Response message content, supports variable templates. |

## Branch Description
Does not support branches.

## Test Support
Not supported. This node cannot use CLI `workflow flow-nodes test` or HTTP `flow_nodes:test`, because the server-side instruction does not implement `test()`.

## Example Configuration
```json
{
  "message": "Operation Successful: {{ $context.data.title }}"
}
```

## Output Variables
This node does not output variables.
