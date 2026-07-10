---
title: "Call Workflow"
description: "Use when a workflow should reuse another workflow as a subroutine, pass it inputs, and consume its Workflow Output result."
---

# Call Workflow

## Node Type

`subflow`

## Node Description
Calls another workflow and uses its "Workflow Output" as a variable in the current process.

## Business Scenario Example
Extract a common process into a sub-workflow for reuse, similar to a function call.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| workflow | string | None | Yes | The key of the workflow to be called. Synchronous processes can only call synchronous processes. |
| context | object | {} | No | Trigger variable context; the structure must meet the input requirements of the target workflow's trigger. Could use variable in context. Variables should follow [Common Conventions - variables](../conventions/index.md#variable-expressions). |

## Branch Description
Does not support branches.

## Test Support
Not supported. This node cannot use CLI `workflow flow-nodes test` or HTTP `flow_nodes:test`, because the server-side instruction does not implement `test()`.

## Example Configuration
```json
{
  "workflow": "order-calc",
  "context": {
    "data": {
      "orderId": "{{ $context.data.id }}"
    }
  }
}
```

## Output Variables
This node exposes a single root result value, referenced directly as `{{$jobsMapByNodeKey.<nodeKey>}}`.

- Exposed root: the called workflow's final output value.
- No child field tree is provided. If the sub-workflow returns an object/array and a later node needs any child field, you must follow this node with `json-variable-mapping` or `json-query`, model the required fields, and make later nodes use only the JSON node's outputs.
- Do not manually append child paths to the Call Workflow node root. Only the JSON modeling node should consume the raw sub-workflow result.
- Example reference: `{{$jobsMapByNodeKey.call_order_calc}}`.
