---
title: "SQL Operation"
description: "Introduces the data source, statement execution, and return structure of the SQL node."
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
- No child field tree is provided. If you need named fields from a row set or metadata tuple, follow this node with `json-query` or `json-variable-mapping`.
- Example reference: `{{$jobsMapByNodeKey.sql_stats}}`.
