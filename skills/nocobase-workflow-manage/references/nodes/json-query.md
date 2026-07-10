---
title: "JSON Calculation"
description: "Use when complex JSON from another node must be calculated, queried, or reshaped before downstream nodes consume it."
---

# JSON Calculation

## Node Type

`json-query`

## Node Description
Uses a JSON query engine to filter, transform, or calculate complex JSON data.

Use this node as the required boundary when raw JSON must be reshaped before downstream use. Put the raw trigger/node result only in `source`, define the downstream field contract in `model`, and make later business nodes consume this node's modeled outputs.

## Business Scenario Example
Extract fields from a third-party response or restructure JSON data.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| engine | string | jmespath | Yes | Query engine: `jmespath`, `jsonpathplus`, `jsonata`. |
| source | any | None | Yes | JSON data source (variable or constant). Variables should follow [Common Conventions - variables](../conventions/index.md#variable-expressions). |
| expression | string | None | Yes | Query expression; syntax is determined by the `engine`. |
| model | array | [] | No | Result mapping rules; applies only when the result is an object or an array of objects. |
| model[].path | string | None | Yes | Value path (dot notation). |
| model[].alias | string | None | No | Field alias; defaults to `path`, with dots converted to underscores. |
| model[].label | string | None | No | Display name (used in the variable tree). |

When this node is used to make raw JSON available to ordinary downstream configuration, `model` must include every field that later nodes need. A query expression alone can produce valid runtime JSON but does not give the frontend a complete child variable tree.

## Branch Description
Branches are not supported.

## Test Support
Supported. This node can use CLI `workflow flow-nodes test` and HTTP `flow_nodes:test`, because the server-side instruction implements `test()`.

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
- Downstream nodes must reference the modeled children from this node rather than manually appending paths to the original raw source.
- Example references for the sample configuration above: `{{$jobsMapByNodeKey.json_query.item_id}}`, `{{$jobsMapByNodeKey.json_query.name}}`.
