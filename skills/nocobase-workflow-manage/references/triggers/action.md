---
title: "Post-action Events"
description: "Trigger flows after user actions (creation/update) are completed, suitable for handling data operations with user context."
---

# Post-action Events

## Trigger Type

`action`

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
| collection | string | - | Yes | The data table where the trigger data resides, format is `"<dataSource>:<collection>"`. |
| global | boolean | false | Yes | Trigger mode: `false` Local mode (binding required), `true` Global mode (effective based on `actions`). |
| actions | string[] | - | Required only in Global mode | Operation types allowed to trigger in Global mode, currently supported: `"create"`, `"update"`. |
| appends | string[] | [] | No | Paths of associated fields to be preloaded. See [Common Conventions - appends](../conventions/index.md#the-appends-field-in-trigger-and-node-configuration). |

## Example Configuration

### Local mode, triggered only by buttons/operations bound to this workflow
```json
{
  "collection": "posts",
  "global": false,
  "appends": ["category", "author"]
}
```

### Global mode, triggered for all create/update operations on the `posts` table of the default data source

```json
{
  "collection": "posts",
  "global": true,
  "actions": ["create", "update"],
  "appends": ["category", "author"]
}
```

## Output Variables
The variable selector for this trigger is a tree array of `{ label, value, children? }`. At runtime, join the `value` segments with `.` and prepend `$context`, for example `{{$context.data.title}}`.

- Exposed roots: `data`, `user`, `roleName`.
- `data` follows the triggered collection schema; any configured `appends` are added as nested children under `data`.
- `user` follows the `users` collection schema; `roleName` is a scalar string.
- Example references: `{{$context.data.id}}`, `{{$context.data.author.nickname}}`, `{{$context.user.nickname}}`, `{{$context.roleName}}`.
