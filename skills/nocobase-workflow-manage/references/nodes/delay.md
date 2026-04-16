---
title: "Delay"
description: "Explains the time unit, duration, and end status configuration of the delay node."
---

# Delay

## Node Type

`delay`

## Node Description
Waits for a specified duration before continuing or ending the workflow. Used for waiting, timeouts, or beat control in parallel branches (only available for asynchronous workflows).

## Business Scenario Example
Automatically close an order after waiting for a payment timeout, similar to `sleep`/`timeout`.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| unit | number | 60000 | Yes | Time unit millisecond multiplier: 1000 (second), 60000 (minute), 3600000 (hour), 86400000 (day), 604800000 (week). |
| duration | number | 1 | Yes | Duration value; multiplied by `unit` to get the total wait time in milliseconds. Could use static values or workflow variables. Variables should follow [Common Conventions - variables](../conventions/index.md#variable-expressions). |
| endStatus | number | 1 | Yes | End status: `1` to succeed and continue, `-1` to fail and exit. |

## Branch Description
Branches are not supported.

## Test Support
Not supported. This node cannot use CLI `workflow flow-nodes test` or HTTP `flow_nodes:test`, because the server-side instruction does not implement `test()`.

## Example Configuration
```json
{
  "unit": 60000,
  "duration": 10,
  "endStatus": 1
}
```

## Output Variables
This node does not output variables.
