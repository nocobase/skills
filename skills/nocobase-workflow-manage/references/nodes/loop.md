---
title: "Loop"
description: "Explains the loop target, condition control, and branch entry rules of the loop node."
---

# Loop

## Node Type

`loop`

## Node Description
Performs cyclic processing on an array, string, or a specified number of times, executing the nodes within the branch for each iteration.

## Business Scenario Example
Iterate through order details to create records one by one, similar to `for`/`foreach` in programming languages.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| target | any | 1 | Yes | Loop target: a number represents the count, a string loops by character array, other values are converted to an array. Context variables can be used. Variables should follow [Common Conventions - variables](../conventions/index.md#variable-expressions). |
| condition | object/boolean | false | No | Loop condition configuration; when enabled, it can continue or break the loop when conditions are met. See "Condition Structure" below. |
| exit | number | 0 | No | Handling when a node within the branch fails: `0` exits the workflow, `1` exits the loop and continues the workflow, `2` ignores the failure and continues to the next item. |

### Condition Structure
When `condition` is an object:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| calculation | object | None | Condition expression (basic logical calculation structure, same as `calculation` in the condition node). |
| checkpoint | number | 0 | When to check: `0` before each iteration, `1` after each iteration. |
| continueOnFalse | boolean | false | Whether to continue to the next item if the condition is not met. |

## Branch Description

- Loop nodes allow only one branch (the loop body).
- Use any non-null `branchIndex` value (0 is commonly used). Additional branches are not permitted.

## Example Configuration
```json
{
  "target": "{{ $context.data.items }}",
  "condition": {
    "checkpoint": 0,
    "continueOnFalse": true,
    "calculation": {
      "group": {
        "type": "and",
        "calculations": [
          { "calculator": "notEqual", "operands": ["{{ $scopes.item.status }}", "skip"] }
        ]
      }
    }
  },
  "exit": 2
}
```

## Output Variables
This node does not output variables.
