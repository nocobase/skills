---
title: "JSON Calculation"
description: "Explains the engine selection, expressions, and result mapping configuration of the JSON query node."
---

# JSON Calculation

## Node Type

`json-query`
Please use the above `type` value to create the node; do not use the document filename as the type.

## Node Description
Uses a JSON query engine to filter, transform, or calculate complex JSON data.

## Business Scenario Example
Extract fields from a third-party response or restructure JSON data.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| engine | string | jmespath | Yes | Query engine: `jmespath`, `jsonpathplus`, `jsonata`. |
| source | any | None | Yes | JSON data source (variable or constant). |
| expression | string | None | Yes | Query expression; syntax is determined by the `engine`. |
| model | array | [] | No | Result mapping rules; applies only when the result is an object or an array of objects. |
| model[].path | string | None | Yes | Value path (dot notation). |
| model[].alias | string | None | No | Field alias; defaults to `path`, with dots converted to underscores. |
| model[].label | string | None | No | Display name (used in the variable tree). |

## Branch Description
Branches are not supported.

## Example Configuration
```json
{
  "engine": "jmespath",
  "source": "{{ $context.data }}",
  "expression": "items[?status=='ok']",
  "model": [
    { "path": "id", "alias": "item_id", "label": "ID" },
    { "path": "name", "label": "Name" }
  ]
}
```

## Output Variables
The variable selector for this node is a tree array of `{ label, value, children? }`. At runtime, join the `value` segments with `.` and prepend `$jobsMapByNodeKey.<nodeKey>`.

- The root is the current node key.
- Each child comes from `model[]`; the runtime path uses `model[].alias` when present, otherwise `model[].path`.
- `model[].label` affects only display text and does not change the expression path.
- Example references for the sample configuration above: `{{$jobsMapByNodeKey.json_query.item_id}}`, `{{$jobsMapByNodeKey.json_query.name}}`.
