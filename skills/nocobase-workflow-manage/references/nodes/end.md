---
title: "End Workflow"
description: "Explains the termination status configuration of the end workflow node."
---

# End Workflow

## Node Type

`end`

## Node Description

Immediately ends the execution of the current workflow and exits with a specified status.

Mostly used in request interception scenarios to block certain operations, or to directly end the workflow when certain conditions are met without needing to execute remaining nodes or default action after workflow end normally.

## Business Scenario Examples

* Directly end the workflow when validation fails, similar to `return` in programming languages.
* In a request-interception workflow, block deletion or update when the record not meet certain business rules, and end with `FAILED` before the default action is executed.
* In a request-interception workflow, block deletion or update but still return a successful response when the record not meet certain business rules, and end with `RESOLVED` before the default action is executed.

## When not to use this node

* Do not use this node as the condition judgment itself. Use nodes such as `condition` or `multi-conditions` to decide the branch first, then connect `end` only on the branch that really needs explicit termination.
* Do not add this node only to represent a normal, expected completion. If the current path has no more downstream nodes, the workflow usually ends automatically.
* In condition branches, if one branch does not need extra processing, you can leave that branch without downstream nodes instead of appending an `end` node only for visual completeness.
* Do not add this node when the current node or branch already carries automatic termination behavior. For example, an `approval` node in direct mode (`branchMode=false`) already terminates on rejection/return, and in branching mode a rejection branch with `endOnReject=true` usually does not need an extra `end` node after the branch finishes.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| endStatus | number | 1 | Yes | End status: `1` indicates success (RESOLVED), `-1` indicates failure (FAILED). |

## Branch Description
Branches are not supported.

## Test Support
Not supported. This node cannot use CLI `workflow flow-nodes test` or HTTP `flow_nodes:test`, because the server-side instruction does not implement `test()`.

## Example Configuration
```json
{
  "endStatus": -1
}
```

## Output Variables
This node does not output variables.
