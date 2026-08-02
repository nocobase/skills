---
title: "Query Data"
description: "Use when later nodes need one or many records from a collection as variables, filtered, sorted, paginated, or preloaded as needed."
---

# Query Data

## Node Type

`query`

## Node Description
Queries data table records based on filter conditions; can return single or multiple results.

## Mandatory Filter Preflight

Before writing `params.filter`, load the `nocobase-utils` skill with topic `filter`, then read [Filter Condition Format](../../../nocobase-utils/references/filter/index.md), inspect the target collection's live field metadata, and validate every operator against the terminal field's frontend operator group. Do not choose comparison operators from natural-language wording alone. For a date field, “before/less than” is `$dateBefore`, not `$lt`; “at least/greater than or equal” is `$dateNotBefore`, not `$gte`.

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

## Test Support
Not supported. This node cannot use CLI `workflow flow-nodes test` or HTTP `flow_nodes:test`, because the server-side instruction does not implement `test()`.

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

### Date comparison example

```json
{
  "collection": "posts",
  "multiple": true,
  "params": {
    "filter": {
      "$and": [
        { "createdAt": { "$dateBefore": "2026-08-01T00:00:00.000Z" } }
      ]
    }
  },
  "failOnEmpty": false
}
```

The phrase “`createdAt` is less than 2026-08-01” has the same date intent and must use `$dateBefore`. `$lt` is valid only for a terminal field in the number operator group.

## Output Variables
The variable selector for this node is a tree array of `{ label, value, children? }`. At runtime, join the `value` segments with `.` and prepend `$jobsMapByNodeKey.<nodeKey>`.

- Exposed root: the query result of the current node.
- The child tree follows the target collection schema, and `params.appends` adds nested association children under the result.
- When `multiple=false`, expressions such as `{{$jobsMapByNodeKey.query_post.title}}` work as expected for the returned record.
- When `multiple=true`, the runtime root value is an array. The selector still describes each record's field shape, but downstream logic usually passes `{{$jobsMapByNodeKey.<nodeKey>}}` into a `loop` or JSON-processing node.
