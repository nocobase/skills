---
title: "Delay"
description: "Explains the time unit, duration, and end status configuration of the delay node."
---

# Delay

## Node Type

`delay`
Please use the above `type` value to create the node; do not use the document filename as the type.

## Node Description
Waits for a specified duration before continuing or ending the workflow. Used for waiting, timeouts, or beat control in parallel branches (only available for asynchronous workflows).

## Business Scenario Example
Automatically close an order after waiting for a payment timeout, similar to `sleep`/`timeout`.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| unit | number | 60000 | Yes | Time unit millisecond multiplier: 1000 (second), 60000 (minute), 3600000 (hour), 86400000 (day), 604800000 (week). |
| duration | number | 1 | Yes | Duration value; multiplied by `unit` to get the total wait time in milliseconds. |
| endStatus | number | 1 | Yes | End status: `1` to succeed and continue, `-1` to fail and exit. |

## Branch Description
Branches are not supported.

## Example Configuration
```json
{
  "unit": 60000,
  "duration": 10,
  "endStatus": 1
}
```
