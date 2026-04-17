---
title: "Workflow Output"
description: "Explains the output value configuration and usage scenarios for the Workflow Output node."
---

# Workflow Output

## Node Type

`output`

## Node Description
Sets the output value of the current workflow; when this workflow is called by a sub-workflow, the output value can be used as an upper-level process variable. In the case of multiple outputs, the last executed output node prevails.

## Business Scenario Example
A sub-workflow calculates a result and returns it to the upper-level workflow as a subsequent variable.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| value | any | None | No | Output value, supports constants or variable expressions, any JSON type. |

## Branch Description
Does not support branches.

## Test Support
Not supported. This node cannot use CLI `workflow flow-nodes test` or HTTP `flow_nodes:test`, because the server-side instruction does not implement `test()`.

## Example Configuration
```json
{
  "value": {
    "total": "{{ $context.data.total }}",
    "count": "{{ $context.data.count }}"
  }
}
```

## Output Variables
This node exposes a single root result value, referenced directly as `{{$jobsMapByNodeKey.<nodeKey>}}`.

- Exposed root: the configured workflow output value of this node.
- No child field tree is provided. If the output is a complex JSON object and you need named child variables in the selector, follow this node with `json-query` or `json-variable-mapping`.
- Example reference: `{{$jobsMapByNodeKey.workflow_output}}`.
