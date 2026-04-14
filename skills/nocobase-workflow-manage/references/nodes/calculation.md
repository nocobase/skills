---
title: "Calculation"
description: "Introduces the expression engine, configuration fields, and result output for the calculation node."
---

# Calculation

## Node Type

`calculation`

## Node Description
Evaluates an expression based on a calculation engine and writes the result to the current node's execution result, which can be referenced by subsequent nodes.

## Business Scenario Examples
Calculating order amounts, concatenating text, or generating derived fields.

## Configuration Items
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| engine | string | formula.js | Yes | Calculation engine: `formula.js`, `math.js`, `string`. It's recommended to specify explicitly; defaults to `math.js` on the backend if not provided. See [evaluator engine reference](../../../nocobase-utils/references/evaluators/index.md) for engine selection guidance. |
| expression | string | None | Yes | Calculation expression; can reference workflow context variables with `{{variable}}` syntax. Expression syntax depends on the `engine`. For available functions see [formula.js reference](../../../nocobase-utils/references/evaluators/formulajs.md) or [math.js reference](../../../nocobase-utils/references/evaluators/mathjs.md). |

## Branch Description
Does not support branching.

## Example Configuration

### `formula.js` engine basic expression

```json
{
  "engine": "formula.js",
  "expression": "{{$context.data.quantity}} - 1"
}
```

### `math.js` engine with variables

```json
{
  "engine": "math.js",
  "expression": "{{value1}} * {{value2}}"
}
```

### `string` engine for text concatenation

```json
{
  "engine": "string",
  "expression": "Order #{{orderId}} - {{status}}"
}
```

## Output Variables
This node exposes a single root result value, referenced directly as `{{$jobsMapByNodeKey.<nodeKey>}}`.

- Exposed root: the calculated result of the current node.
- No child field tree is provided; the result is consumed as a scalar or whole value.
- Example reference: `{{$jobsMapByNodeKey.abc123}}`.
