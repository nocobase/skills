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

## UI Setup for Local Mode

When `global = false`, this trigger does not run until the workflow is bound on a supported UI action button.

- Supported UI entry points:
  - Create-form `Submit` button.
  - Edit-form `Submit` button.
  - Record-level `Update data` actions that open an edit form, then submit that form.
- If the page or button does not exist yet, use the UI builder references for the page-side work:
  - [UI builder recipe - forms and actions](../../../nocobase-ui-builder/references/recipes/forms-and-actions.md)
  - [UI builder settings - add-action](../../../nocobase-ui-builder/references/settings.md#add-action)
  - [UI builder settings - add-record-action](../../../nocobase-ui-builder/references/settings.md#add-record-action)

<!-- TODO: ### Binding Steps -->

### Global Mode Note

When `global = true`, no button binding is required. Any matching create/update action on the configured collection can trigger the workflow automatically. Use local mode when only specific buttons or forms should expose the trigger.

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
