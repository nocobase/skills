---
title: "Webhook Response"
description: "Explains the status code, response headers, and body configuration for the Webhook response node, which terminates the workflow on execution."
---

# Webhook Response

## Node Type

`response`

## Node Description

Returns an HTTP response to the third-party system that triggered the synchronous Webhook workflow, and immediately terminates the workflow execution. Subsequent nodes will not run after this node executes.

This node is only available in **synchronous Webhook** workflows (`workflow.type === 'webhook'` with sync mode enabled).

If the workflow has no response node, the system responds automatically based on the execution result: `200` on success, `500` on failure.

## Business Scenario Examples

* In a payment callback handler, if business validation fails, return a custom error response so the third-party system can retry later.
* Return a structured JSON body to the caller with processed data from the workflow context.
* Set custom response headers (e.g., `X-Request-Id`) alongside the response body.

## When Not to Use This Node

* Do not use in asynchronous Webhook workflows or any other trigger type — the node will not be available.
* Do not place this node in a non-terminal position expecting downstream nodes to run; this node always exits the workflow.

## Configuration List

| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| statusCode | number | 200 | Yes | HTTP status code to return. Must be an integer between 200 and 599. |
| headers | array | [] | No | List of response headers. Each item is `{ name: string, value: string }`. Header names must match `/^[a-zA-Z][a-zA-Z0-9_-]*$/`. |
| body | any | {} | No | Response body (JSON). Supports workflow context variables via template expressions. |

## Branch Description

Does not support branches. This is a terminal node (`end = true`); no downstream nodes run after it.

## Test Support

Not supported. This node cannot use CLI `workflow flow-nodes test` or HTTP `flow_nodes:test`, because the server-side instruction does not implement `test()`.

## Example Configuration

```json
{
  "statusCode": 422,
  "headers": [
    { "name": "X-Request-Id", "value": "{{$context.data.requestId}}" }
  ],
  "body": {
    "ok": false,
    "message": "Validation failed",
    "data": "{{$context.data}}"
  }
}
```

## Output Variables

This node does not output variables.
