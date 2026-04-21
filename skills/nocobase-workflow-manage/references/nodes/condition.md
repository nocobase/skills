---
title: "Condition"
description: "Explains the engine selection, calculation structure, and branch rules for the condition node."
---

# Condition

## Node Type

`condition`

## Node Description
Determines the flow direction based on the judgment result: it can either "continue only if true" or proceed via "Yes/No" branches.

## Business Scenario Examples
Deciding whether to continue the process based on whether inventory is sufficient, similar to if/else in programming languages.

## Configuration Items
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| rejectOnFalse | boolean | true | Yes | Mode selection. `true` means continue only if the condition is true, otherwise end with a failed status; `false` enables "Yes/No" branching. |
| engine | string | basic | Yes | Calculation engine: `basic`, `math.js`, `formula.js`. See [evaluator engine reference](../../../nocobase-utils/references/evaluators/index.md) for engine selection guidance. |
| calculation | object | None | Yes (if engine=basic) | Logical calculation configuration used when `engine=basic`. See "basic structure description" below. |
| expression | string | None | Yes (if engine!=basic) | Expression used when `engine` is not `basic`. For available functions see [formula.js reference](../../../nocobase-utils/references/evaluators/formulajs.md) or [math.js reference](../../../nocobase-utils/references/evaluators/mathjs.md). |

If intended condition logic could be cover by basic engine, it's recommended to use it for better performance. Otherwise, select `formula.js` or `math.js` and write the expression directly.

### basic Structure Description
`calculation` supports grouping and nesting:
- `calculation.group.type`: `and` or `or`
- `calculation.group.calculations`: Array of conditions, elements can be "calculation items" or nested groups.
- Calculation item structure: `{ "calculator": string, "operands": [left, right] }`
- Built-in `calculator`: `equal`, `notEqual`, `gt`, `gte`, `lt`, `lte`, `includes`, `notIncludes`, `startsWith`, `notStartsWith`, `endsWith`, `notEndsWith` (can also be extended and registered).

## Branch Description
- When `rejectOnFalse=true`, no branches are generated, and the `branchIndex` of downstream nodes should be `null`.
- When `rejectOnFalse=false`, branching is enabled:
  - `branchIndex=1`: Condition is true (Yes)
  - `branchIndex=0`: Condition is false (No)

## Test Support
Supported. This node can use CLI `workflow flow-nodes test` and HTTP `flow_nodes:test`, because the server-side instruction implements `test()`.

## Example Configuration

### `basic` engine

```json
{
  "rejectOnFalse": false,
  "engine": "basic",
  "calculation": {
    "group": {
      "type": "and",
      "calculations": [
        {
          "calculator": "equal",
          "operands": ["{{ $context.data.status }}", "approved"]
        }
      ]
    }
  }
}
```

### `formula.js` engine

Variable in expression should be wrapped with `{{}}` to be recognized and parsed by the engine.

```json
{
  "rejectOnFalse": false,
  "engine": "formula.js",
  "expression": "IF({{$context.data.status}} == 'paid', true, false)"
}
```

## Output Variables
This node does not output variables.
