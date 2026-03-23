---
title: "Post-action Events"
description: "Trigger flows after user actions (creation/update) are completed, suitable for handling data operations with user context."
---

# Post-action Events

## Trigger Type

`action`
Please use the `type` value above to create the trigger; do not use the documentation filename as the type.

## Use Cases
- Executing flows immediately after user operations (e.g., notifications, approvals, synchronization after creation/update).
- When the flow context needs to include operator information (user and role).

## Trigger Timing / Events
- Monitors in-app operation requests (Koa middleware layer), currently mainly including `create` / `update` operations.
- **Local Mode**: Triggered only by buttons/operations bound to this workflow.
- **Global Mode**: Triggered for all operations on the selected data table and operation types.

## Configuration Items
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| collection | string | - | Yes | The data table where the trigger data resides, format is `"<dataSource>.<collection>"`. |
| global | boolean | false | Yes | Trigger mode: `false` Local mode (binding required), `true` Global mode (effective based on `actions`). |
| actions | string[] | - | Required only in Global mode | Operation types allowed to trigger in Global mode, currently supported: `"create"`, `"update"`. |
| appends | string[] | [] | No | Paths of associated fields to be preloaded, used to supplement trigger data. |

## Trigger Variables
- `$context.data`: The triggered data record (preloaded via `appends` when necessary).
- `$context.user`: The user who triggered the operation (sanitized user information).
- `$context.roleName`: The role name of the user who triggered the operation.

## Example Configuration
```json
{
  "collection": "main.posts",
  "global": true,
  "actions": ["create", "update"],
  "appends": ["category", "author"]
}
```
