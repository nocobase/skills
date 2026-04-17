---
title: "Update Record"
description: "Explains the filter conditions, update modes, and configuration examples for the Update Record node."
---

# Update Record

## Node Type

`update`
Please use the `type` value above to create the node; do not use the documentation filename as the type.

## Node Description
Updates records in a data table based on filter conditions, with options for batch or individual updates.

## Business Scenario Examples
Updating the status and timestamp fields after an order is successfully paid.

## Configuration Items
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| collection | string | None | Yes | Target data table. For a single data source, use the collection name, e.g. `posts`; for data sources not main, use `dataSource:collection`. |
| usingAssignFormSchema | boolean | false | Yes | Whether to use a custom assignment form (primarily affects the frontend configuration display). This option Should always be set to false for new configurations. |
| assignFormSchema | object | {} | No | UI Schema for the custom assignment form (primarily for frontend use). The schema format follows Formily form schema, each field should be configured accordingly (type in collection) as the values are assigned. Each key of properties should be generated as an uid string. |
| params.individualHooks | boolean | false | No | Update mode: `false` for batch update; `true` for individual update (triggers record-level hooks/workflows). |
| params.filter | object | None | Yes | Filter conditions (must contain at least one condition). See [Common Conventions - filter](../conventions/index.md#the-filter-field-in-trigger-and-node-configuration). |
| params.values | object | {} | No | Field assignment object, where keys are field names and values can be constants or variables; must include at least one field to be updated. |

## Branching
Does not support branches.

## Test Support
Not supported. This node cannot use CLI `workflow flow-nodes test` or HTTP `flow_nodes:test`, because the server-side instruction does not implement `test()`.

## Example Configuration

### usingAssignFormSchema: false

```json
{
  "collection": "posts",
  "usingAssignFormSchema": false,
  "assignFormSchema": {},
  "params": {
    "individualHooks": true,
    "filter": {
      "$and": [
        { "id": { "$eq": "{{ $context.data.id }}" } }
      ]
    },
    "values": {
      "status": "published"
    }
  }
}
```

## Output Variables
This node does not output variables.
