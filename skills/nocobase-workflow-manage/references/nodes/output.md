---
title: "Workflow Output"
description: "Explains the output value configuration and usage scenarios for the Workflow Output node."
---

# Workflow Output

## Node Type

`output`
Please use the `type` value above to create the node; do not use the documentation filename as the type.

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

## Example Configuration
```json
{
  "value": {
    "total": "{{ $context.data.total }}",
    "count": "{{ $context.data.count }}"
  }
}
```