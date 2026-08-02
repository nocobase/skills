---
title: "Delete Data"
description: "Use when a workflow must delete records matching a filter, including cleanup jobs or removing invalid or expired business data."
---

# Delete Data

## Node Type

`destroy`
Please use the above `type` value to create the node; do not use the document filename as the type.

## Node Description
Deletes records from a data table according to filtering conditions.

Before writing `params.filter`, load the `nocobase-utils` skill with topic `filter`, then read [Filter Condition Format](../../../nocobase-utils/references/filter/index.md), resolve every terminal field's live frontend interface/type, and select operators only from that field group's allowlist. This destructive node must not be written when a field type or operator remains guessed.

## Business Scenario Example
Periodically clean up canceled historical records.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| collection | string | None | Yes | Target data table. For a single data source, you can write the collection name directly. For multiple data sources, use `dataSource:collection`. |
| params.filter | object | None | Yes | Filtering conditions (must contain at least one condition). See [Common Conventions - filter](../conventions/index.md#the-filter-field-in-trigger-and-node-configuration). |

## Branch Description
Branches are not supported.

## Test Support
Not supported. This node cannot use CLI `workflow flow-nodes test` or HTTP `flow_nodes:test`, because the server-side instruction does not implement `test()`.

## Example Configuration
```json
{
  "collection": "orders",
  "params": {
    "filter": {
      "$and": [
        { "status": { "$eq": "canceled" } },
        { "createdAt": { "$dateNotAfter": "{{ $system.now }}" } }
      ]
    }
  }
}
```

## Output Variables
This node does not output variables.
