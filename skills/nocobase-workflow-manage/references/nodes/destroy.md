---
title: "Delete Data"
description: "Introduces the filtering conditions and configuration points of the delete data node."
---

# Delete Data

## Node Type

`destroy`
Please use the above `type` value to create the node; do not use the document filename as the type.

## Node Description
Deletes records from a data table according to filtering conditions.

## Business Scenario Example
Periodically clean up canceled historical records.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| collection | string | None | Yes | Target data table. For a single data source, you can write the collection name directly. For multiple data sources, use `dataSource:collection`. |
| params.filter | object | None | Yes | Filtering conditions (must contain at least one condition). See [Common Conventions - filter](../conventions/index.md#the-filter-field-in-trigger-and-node-configuration). |

## Branch Description
Branches are not supported.

## Example Configuration
```json
{
  "collection": "orders",
  "params": {
    "filter": {
      "$and": [
        { "status": { "$eq": "canceled" } },
        { "createdAt": { "$lte": "{{ $system.now }}" } }
      ]
    }
  }
}
```

## Output Variables
This node does not output variables.
