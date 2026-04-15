---
title: "Query Data"
description: "Explains the filtering, sorting, pagination, and return modes of the Query Data node."
---

# Query Data

## Node Type

`query`

## Node Description
Queries data table records based on filter conditions; can return single or multiple results.

## Business Scenario Example
Querying the current user's order list or checking if a record exists.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| collection | string | None | Yes | Target data table. For a single data source, write the collection name directly; for multiple data sources, write `dataSource:collection`. |
| multiple | boolean | false | Yes | Result type: `false` returns a single record or `null`; `true` returns an array. |
| params.filter | object | None | No | Filter conditions. See [Common Conventions - filter](../conventions/index.md#the-filter-field-in-trigger-and-node-configuration). |
| params.sort | array | [] | No | Array of sorting rules, elements like `{ "field": "createdAt", "direction": "desc" }`. |
| params.page | number | 1 | No | Page number. |
| params.pageSize | number | 20 | No | Number of items per page. |
| params.appends | string[] | [] | No | List of association fields to pre-load. See [Common Conventions - appends](../conventions/index.md#the-appends-field-in-trigger-and-node-configuration). |
| failOnEmpty | boolean | false | No | Whether to exit with a failure status if the query result is empty. |

## Branch Description
Does not support branches.

## Example Configuration
```json
{
  "collection": "posts",
  "multiple": true,
  "params": {
    "filter": {
      "$and": [
        { "status": { "$eq": "published" } }
      ]
    },
    "sort": [
      { "field": "createdAt", "direction": "desc" }
    ],
    "page": 1,
    "pageSize": 10,
    "appends": ["author"]
  },
  "failOnEmpty": false
}
```

## Output Variables
The variable selector for this node is a tree array of `{ label, value, children? }`. At runtime, join the `value` segments with `.` and prepend `$jobsMapByNodeKey.<nodeKey>`.

- Exposed root: the query result of the current node.
- The child tree follows the target collection schema, and `params.appends` adds nested association children under the result.
- When `multiple=false`, expressions such as `{{$jobsMapByNodeKey.query_post.title}}` work as expected for the returned record.
- When `multiple=true`, the runtime root value is an array. The selector still describes each record's field shape, but downstream logic usually passes `{{$jobsMapByNodeKey.<nodeKey>}}` into a `loop` or JSON-processing node.
