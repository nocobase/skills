---
title: "Create Data"
description: "Explains the target collection and field assignment method of the create data node."
---

# Create Data

## Node Type

`create`

## Node Description
Adds a new record to a specified data table, with fields assigned using workflow context variables.

## Business Scenario Example
Add an order log or related record after an order is submitted.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| collection | string | None | Yes | Target data table. The format matches the data source selector. For a single data source, write the collection name (e.g., `posts`). For data sources not main, use `dataSource:collection`. |
| usingAssignFormSchema | boolean | false | Yes | Whether to use a custom assignment form (primarily affects the frontend configuration display). This option Should always be set to false for new configurations. |
| params.values | object | {} | No | Field assignment object where keys are field names and values can be constants or variables. Unassigned fields will use their default value or `null`. Variables should follow [Common Conventions - variables](../conventions/index.md#variable-expressions). |
| params.appends | string[] | [] | No | List of relationship fields to pre-load. See [Common Conventions - appends](../conventions/index.md#the-appends-field-in-trigger-and-node-configuration). |

## Branch Description

Branches are not supported.

## Example Configuration

```json
{
  "collection": "orderLogs",
  "usingAssignFormSchema": false,
  "assignFormSchema": {},
  "params": {
    "values": {
      "orderId": "{{$context.data.id}}",
      "eventType": "{{$context.data.status}}",
      "timestamp": "{{$context.date}}"
    },
    "appends": []
  }
}
```

## Output Variables
The variable selector for this node is a tree array of `{ label, value, children? }`. At runtime, join the `value` segments with `.` and prepend `$jobsMapByNodeKey.<nodeKey>`.

- Exposed root: the record created by this node.
- The child tree follows the target collection schema, and `params.appends` adds nested association children under the created record.
- Example references: `{{$jobsMapByNodeKey.create_log.id}}`, `{{$jobsMapByNodeKey.create_log.eventType}}`, `{{$jobsMapByNodeKey.create_log.creator.nickname}}`.
