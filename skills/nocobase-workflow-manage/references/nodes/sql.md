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
| sql | string | None | Yes | SQL statement, supports variable templates. |
| withMeta | boolean | false | No | Whether to return metadata (returns `[result, meta]`). |

## Branch Description
Does not support branches.

## Example Configuration
```json
{
  "dataSource": "main",
  "sql": "SELECT COUNT(*) AS total FROM orders WHERE status = 'paid'",
  "withMeta": false
}
```