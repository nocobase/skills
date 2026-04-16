---
title: "End Workflow"
description: "Explains the termination status configuration of the end workflow node."
---

# End Workflow

## Node Type

`end`

## Node Description
Immediately ends the execution of the current workflow and exits with a specified status.

## Business Scenario Example
Directly end the workflow when validation fails, similar to `return` in programming languages.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| endStatus | number | 1 | Yes | End status: `1` indicates success (RESOLVED), `-1` indicates failure (FAILED). |

## Branch Description
Branches are not supported.

## Example Configuration
```json
{
  "endStatus": -1
}
```

## Output Variables
This node does not output variables.
