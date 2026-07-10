---
title: "SQL Operation"
description: "Use when collection operation nodes are insufficient and the workflow must run a parameterized SQL statement against a data source."
---

# SQL Operation

## Node Type

`sql`
Please use the `type` value above to create the node; do not use the documentation filename as the type.

## Node Description
Executes an SQL statement on a database data source and returns the result.

## Business Scenario Example
Executing statistical SQL or batch correcting data. For standard CRUD operations, it is recommended to use the corresponding node types (such as Query, Update, or Destroy nodes) to better utilize the workflow's variable mapping and result processing features.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| dataSource | string | main | Yes | Data source key; must be a database-type data source. |
| sql | string | None | Yes | SQL statement, supports variable configured in the parameters list, and using `:var_name` format (NOT common `{{ var_name }}` format). |
| variables | array of objects | [] | No | List of parameters used in the SQL statement. Each parameter object should have `name` (string) and `value` (any) fields. The value can be a static value or a workflow variable reference. See [Common Conventions - variables](../conventions/index.md#variable-expressions). |
| withMeta | boolean | false | No | Whether to return metadata (returns `[result, meta]`). Better to set to `false` |

## Branch Description
Does not support branches.

## Test Support
Supported. This node can use CLI `workflow flow-nodes test` and HTTP `flow_nodes:test`, because the server-side instruction implements `test()`.

## Example Configuration
```json
{
  "dataSource": "main",
  "sql": "SELECT COUNT(*) AS total FROM orders WHERE status = :status",
  "variables": [
    { "name": "status", "value": "{{$context.data.status}}" }
  ],
  "withMeta": false
}
```

## Output Variables
This node exposes a single root result value, referenced directly as `{{$jobsMapByNodeKey.<nodeKey>}}`.

- Exposed root: the full SQL execution result.
- No child field tree is provided. If downstream nodes need to use any field from the SQL result, you must immediately follow this node with `json-variable-mapping` or `json-query`, pass the whole SQL result as its source, and define the required output fields.
- Only the JSON modeling node may consume `{{$jobsMapByNodeKey.<nodeKey>}}`. All later nodes must reference the modeled JSON node output; do not manually configure paths such as `{{$jobsMapByNodeKey.sql_stats.0.total}}` even if the server can resolve them, because those paths are absent from the frontend variable tree and cannot be displayed or maintained reliably.
- Example reference: `{{$jobsMapByNodeKey.sql_stats}}`.
