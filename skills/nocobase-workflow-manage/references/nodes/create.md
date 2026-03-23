---
title: "Create Data"
description: "Explains the target collection and field assignment method of the create data node."
---

# Create Data

## Node Type

`create`
Please use the above `type` value to create the node; do not use the document filename as the type.

## Node Description
Adds a new record to a specified data table, with fields assigned using workflow context variables.

## Business Scenario Example
Add an order log or related record after an order is submitted.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| collection | string | None | Yes | Target data table. The format matches the data source selector. For a single data source, write the collection name (e.g., `posts`). For multiple data sources, use `dataSource:collection`. |
| usingAssignFormSchema | boolean | true | No | Whether to use a custom assignment form (primarily affects the frontend configuration display). |
| assignFormSchema | object | {} | No | UI Schema for the custom assignment form (primarily for frontend use). |
| params.values | object | {} | No | Field assignment object where keys are field names and values can be constants or variables. Unassigned fields will use their default value or `null`. |
| params.appends | string[] | [] | No | List of relationship fields to pre-load, used to include relationship data in the node result. |

## Branch Description
Branches are not supported.

## Example Configuration
```json
{
  "collection": "posts",
  "usingAssignFormSchema": false,
  "assignFormSchema": {},
  "params": {
    "values": {
      "title": "Automatically Generated",
      "status": "draft",
      "author_id": "{{ $context.user.id }}"
    },
    "appends": ["author"]
  }
}
```
