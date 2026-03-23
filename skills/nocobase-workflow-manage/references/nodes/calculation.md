---
title: "Calculation"
description: "Introduces the expression engine, configuration fields, and result output for the calculation node."
---

# Calculation

## Node Type

`calculation`
Use the above `type` value when creating the node; do not use the documentation filename as the type.

## Node Description
Evaluates an expression based on a calculation engine and writes the result to the current node's execution result, which can be referenced by subsequent nodes.

## Business Scenario Examples
Calculating order amounts, concatenating text, or generating derived fields.

## Configuration Items
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| engine | string | formula.js | Yes | Calculation engine. Common ones are `math.js`, `formula.js`, `string` (string template). It's recommended to specify explicitly; defaults to `math.js` on the backend if not provided. |
| expression | string | None | Yes | Calculation expression, can use workflow context variables. Expression syntax depends on the `engine`. |

## Branch Description
Does not support branching.

## Example Configuration
```json
{
  "engine": "formula.js",
  "expression": "1 + 2"
}
```