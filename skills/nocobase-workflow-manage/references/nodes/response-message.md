---
title: "Response Message"
description: "Explains the return prompt configuration of the response message node in synchronous intercept flows."
---

# Response Message

## Node Type

`response-message`
Please use the `type` value above to create the node; do not use the documentation filename as the type.

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

## Example Configuration
```json
{
  "message": "Operation Successful: {{ $context.data.title }}"
}
```

## Output Variables
This node does not output variables.
