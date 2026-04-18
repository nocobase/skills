---
title: "Pre-action Event"
description: "Intercepts before data operation requests are executed, suitable for data validation and logic judgment. Requests can be rejected via the 'End Process' node, with error messages output through the 'Response Message' node."
---

# Pre-action Event

## Trigger Type

`request-interception`

## Use Cases
- Performing validation or logic judgment before data create, update, or delete operations are executed.
- Rejecting certain operation requests based on business rules (e.g., blocking submission when data validation fails).
- Preprocessing or reviewing submitted data before the operation is executed.

## Trigger Timing / Events
- Triggered **before** an operation request (initiated via a button or API) is actually executed.
- Acts as middleware intercepting `create`, `update`, `updateOrCreate`, and `destroy` operations.
- **Always executes synchronously** (`sync = true`); the request is only allowed to proceed after the flow completes.

## Configuration Items
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| collection | string | - | Yes | The data table to monitor, format is `"<dataSource>:<collection>"` (e.g., `"posts"` / `"mysql:orders"`; `dataSource` can be omitted when using the main data source). |
| global | boolean | false | No | Trigger mode: `false` Local mode (requires button binding), `true` Global mode (automatically effective for selected actions). |
| actions | string[] | - | Required only in Global mode | Action types to monitor in Global mode, supported: `"create"`, `"update"`, `"destroy"`. Commonly, only one action is used in one workflow, and this could make the logic clear. |

## Trigger Mode Details

### Local Mode (global = false)
- Requires manually binding this workflow to an action button.
- The workflow is only executed when the bound button triggers an action.
- Suitable for specific form or button scenarios.

### Global Mode (global = true)
- Takes effect globally for the selected action types on the specified data table, without manual binding.
- All matching operation requests automatically trigger this workflow.
- The `actions` field must be used to specify which actions to monitor.

## Execution Order
- Multiple workflows on the same data table execute sequentially: local mode workflows execute first, followed by global mode workflows.
- Local mode workflows execute in the order specified in the `triggerWorkflows` parameter.
- Global mode workflows execute in ascending order of workflow ID.
- Once any workflow intercepts the request, subsequent workflows are not executed.

## UI Setup for Local Mode

When `global = false`, this trigger only runs on buttons that are explicitly bound to the workflow.

- Supported UI entry points:
  - Create-form `Submit` / `Save` buttons.
  - Edit-form `Submit` / `Save` buttons.
  - Record-level `Update data` actions that submit an edit form.
  - `Delete` buttons.
- Not supported:
  - `Trigger workflow` buttons. Those are reserved for the `custom-action` trigger.
- If the page or button still needs to be added, use:
  - [UI builder recipe - forms and actions](../../../nocobase-ui-builder/references/recipes/forms-and-actions.md)
  - [UI builder settings - add-action](../../../nocobase-ui-builder/references/settings.md#add-action)
  - [UI builder settings - add-record-action](../../../nocobase-ui-builder/references/settings.md#add-record-action)

### Binding Steps

1. Create the workflow as `request-interception`, configure `collection`, and keep `global = false`.
2. Enable the workflow; disabled workflows are not selectable from the binding dialog.
3. Open the target page/block and locate the button whose request should be intercepted.
4. Open the button settings and choose `Bind workflows`.
5. Add a binding row.
6. Select the enabled pre-action workflow whose `config.collection` matches the selected context collection.
7. Save the binding and page/schema changes, then test both pass-through and intercepted cases from the UI.

### Global Mode Note

When `global = true`, no UI binding is needed. Any matching request on the configured collection and selected `actions` set is intercepted automatically.

## Interception Mechanism
- Flow completes normally (status: resolved, and without any end nodes executed): The request is allowed through, and the original operation continues.
- Flow is terminated by an "End Process" node with failure status: The request is intercepted, returning a 400 error with relevant error messages. This is most commonly used to block requests that fail validation or do not meet certain business requirements.
- Flow is terminated by an "End Process" node with success status: The request is intercepted, returning a 200 with relevant success messages. This can be used to block default operations while still returning a successful response, for example, to implement custom logic that prevents certain updates without treating them as errors.
- Flow execution error: Returns a 500 error.

## Example Configuration

### Local Mode
```json
{
  "collection": "mysql:orders",
  "global": false
}
```

### Global Mode
```json
{
  "collection": "orders",
  "global": true,
  "actions": ["create", "update"]
}
```

## Output Variables
The variable selector for this trigger is a tree array of `{ label, value, children? }`. At runtime, join the `value` segments with `.` and prepend `$context`.

- Exposed roots: `user`, `roleName`, `params`.
- `user` follows the `users` collection schema; `roleName` is a scalar string.
- `params.filterByTk` is exposed as the target record primary key.
- For create and update interception, `params.values` expands to the target collection's fields, so expressions such as `{{$context.params.values.status}}` are valid.
- The runtime context may also contain other request properties such as `params.filter`, but the variable selector described here exposes only `filterByTk` and `values`.
- Example references: `{{$context.user.nickname}}`, `{{$context.roleName}}`, `{{$context.params.filterByTk}}`, `{{$context.params.values.amount}}`.
