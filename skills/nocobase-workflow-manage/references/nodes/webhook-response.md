---
title: "Response"
description: "Explains the status code, response headers, and return body configuration for the Webhook response node."
---

# Response

## Node Type

`response`
Please use the `type` value above to create the node; do not use the documentation filename as the type.

## Node Description
Configures the HTTP response content for a synchronous Webhook flow and terminates the flow.

## Business Scenario Examples
Directly returning validation results or processing status within a Webhook flow, analogous to a `return` in an HTTP handler.

## Configuration Items
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| statusCode | number | 200 | Yes | HTTP status code. |
| headers | array | [] | No | Array of response headers, each item being `{ name, value }`. |
| body | object | {} | No | Response body (JSON only). |

## Branching
Does not support branches (terminal node).

## Example Configuration
```json
{
  "statusCode": 200,
  "headers": [
    { "name": "X-Request-Id", "value": "{{ $context.data.requestId }}" }
  ],
  "body": {
    "ok": true,
    "data": "{{ $context.data }}"
  }
}
```

## Output Variables
This node does not output variables.
