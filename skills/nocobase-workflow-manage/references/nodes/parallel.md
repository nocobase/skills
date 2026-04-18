---
title: "Parallel Branch"
description: "Introduces the aggregation mode and branching rules of the Parallel Branch node."
---

# Parallel Branch

## Node Type

`parallel`

## Node Description
Executes multiple branches simultaneously and aggregates the results of the branches according to a specified mode.

## Business Scenario Example
Calling multiple third-party interfaces simultaneously and aggregating the results, similar to fork/join.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| mode | string | all | No | Aggregation mode: `all` (continues only if all succeed), `any` (continues if any succeed), `race` (continues if any succeed, fails if any fail), `allSettled` (ignores failures, continues after all are completed). |

## Branch Description
The parallel node opens multiple branches:
- `branchIndex` is a positive integer (starting from 1), with each branch corresponding to a parallel process.

## Test Support
Not supported. This node cannot use CLI `workflow flow-nodes test` or HTTP `flow_nodes:test`, because the server-side instruction does not implement `test()`.

## Example Configuration
```json
{
  "mode": "all"
}
```

## Output Variables
This node does not output variables.
