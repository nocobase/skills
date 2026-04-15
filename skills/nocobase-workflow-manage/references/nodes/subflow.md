---
title: "Call Workflow"
description: "Explains how the sub-workflow call node handles the called workflow and context parameter passing."
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
- No child field tree is provided. If the sub-workflow returns structured JSON and you need named child variables, follow this node with `json-query` or `json-variable-mapping`.
- Example reference: `{{$jobsMapByNodeKey.call_order_calc}}`.
