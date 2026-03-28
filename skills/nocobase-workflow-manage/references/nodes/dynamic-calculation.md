---
title: "Dynamic Expression Calculation"
description: "Explains how the dynamic expression calculation node reads expressions and executes calculations."
---

# Dynamic Expression Calculation

## Node Type

`dynamic-calculation`
Please use the above `type` value to create the node; do not use the document filename as the type.

## Node Description
Reads a dynamic expression from an "Expression Collection" and executes the calculation, returning the result.

## Business Scenario Example
Dynamically calculate discounts or ratings based on expressions in a configuration table.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| expression | string | None | Yes | Source of the dynamic expression (usually a variable from an expression collection). The parsed result must contain `engine` and `expression`. |
| scope | string | None | No | Variable data source, used as the scope for expression execution. |

## Branch Description
Branches are not supported.

## Example Configuration
```json
{
  "expression": "{{ $context.data.expressionRecord }}",
  "scope": "{{ $context.data }}"
}
```
