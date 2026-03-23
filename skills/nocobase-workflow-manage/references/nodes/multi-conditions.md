---
title: "Multi-condition Branch"
description: "Explains the condition list, 'otherwise' branch, and continuation rules for the Multi-condition Branch node."
---

# Multi-condition Branch

## Node Type

`multi-conditions`
Please use the `type` value above to create the node; do not use the documentation filename as the type.

## Node Description
Evaluates multiple conditions in sequential order; if a condition is met, the process enters the corresponding branch, otherwise it continues to evaluate the next condition. If none are met, it enters the "otherwise" branch.

## Business Scenario Example
Choosing different processing branches based on status/level, similar to switch/case or if-else if.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| conditions | array | None | Yes | List of conditional branches, corresponding to the branch order in the array. For the structure of each item, see "Structure of conditions item" below. |
| continueOnNoMatch | boolean | false | No | Whether to continue subsequent nodes after the "otherwise" branch is executed when no conditions are met. `false` means it ends with a failure. |

### Structure of conditions item
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| uid | string | None | No | Unique identifier for the conditional branch, mainly used for front-end display; recommended to provide. |
| title | string | None | No | Title of the conditional branch; defaults to "Condition X" if not set. |
| engine | string | basic | Yes | Calculation engine: `basic`, `math.js`, `formula.js`. |
| calculation | object | None | Yes (engine=basic) | Used when `engine=basic`, structure same as `calculation` in the Condition node. |
| expression | string | None | Yes (engine!=basic) | Expression used when `engine` is not `basic`. |

## Branch Description

- Branch indexes:
  - `branchIndex = 0` reserved for the "otherwise" branch.
  - Positive integers (`1..n`) correspond to each condition block in left-to-right order.
- Each branchIndex value can appear at most once.
- When adding a new condition branch, pick the next integer after the current maximum.

## Example Configuration
```json
{
  "conditions": [
    {
      "uid": "c1",
      "title": "Approved",
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
    },
    {
      "uid": "c2",
      "title": "Amount > 1000",
      "engine": "math.js",
      "expression": "{{ $context.data.amount }} > 1000"
    }
  ],
  "continueOnNoMatch": true
}
```