---
title: "Data Table Events"
description: "Monitor additions/updates/deletions of specified data tables and trigger flows, with trigger data written to $context.data."
---

# Data Table Events

## Trigger Type

`collection`

## Use Cases
- Executing automated flows after data table records are added, updated, or deleted (e.g., inventory deduction, status synchronization).
- Triggering based on data changes themselves rather than a specific button or HTTP request.

## Trigger Timing / Events
- Monitors data change events on specified data tables: add, update, delete.
- Only in-app data operations will trigger (HTTP API calls are also considered in-app operations). Direct writes at the database layer will not trigger.

## Configuration Items
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| collection | string | - | Yes | The data table where the trigger data resides, format is `"<dataSource>:<collection>"` (e.g., `"mysql:posts"`); `dataSource` can be omitted if it's the main data source. |
| mode | number | - | Yes | Trigger timing bitmap: `1` for add, `2` for update, `3` for add or update, `4` for delete. |
| changed | string[] | [] | No | Effective only when update is included. If fields are selected, the trigger occurs only when these fields change; if empty, any field change triggers. |
| condition | object | null | No | Filter conditions, effective only for add/update. The trigger occurs only when conditions are met. See [Common Conventions - filter](../conventions/index.md#the-filter-field-in-trigger-and-node-configuration). |
| appends | string[] | [] | No | Paths of associated fields to be preloaded. Associations are not loaded for delete events. See [Common Conventions - appends](../conventions/index.md#the-appends-field-in-trigger-and-node-configuration). |

## Trigger Variables
- `$context.data`: The triggered data record.
  - Add/Update: A snapshot of the latest record, including associated data preloaded via `appends`.
  - Delete: A snapshot of the data before deletion, `appends` are not loaded.

## Example Configuration

### When add a post in main data source

```json
{
  "collection": "posts",
  "mode": 1,
  "changed": ["status", "title"],
  "condition": {
    "$and": [
      {
        "status": { "$ne": "archived" }
      },
      {
        "$or": [
          { "title": { "$includes": "Nocobase" } },
          { "category.name": { "$eq": "Tech" } }
        ]
      }
    ]
  },
  "appends": ["category", "author"]
}
```

### When delete a post in main data source

```json
{
  "collection": "posts",
  "mode": 4,
}
```

### When update a post in "mysql" (external) data source

```json
{
  "collection": "mysql:posts",
  "mode": 2,
  "changed": ["status"],
  "condition": {
    "$and": [
      { "status": { "$eq": "published" } }
    ]
  }
}
```
