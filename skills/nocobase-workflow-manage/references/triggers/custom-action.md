---
title: "Custom Action Event"
description: "Manually trigger flows via a 'Trigger Workflow' button, supporting three context types: global custom data, single record, and multiple records."
---

# Custom Action Event

## Trigger Type

`custom-action`

## Use Cases
- Manually triggering flows via a "Trigger Workflow" button in the UI, rather than by data changes or built-in action buttons.
- When built-in CRUD operations cannot meet business requirements and a series of complex operational logic needs to be defined through a workflow.
- Binding custom workflows to form actions, record row actions (single or multiple), or global buttons.

## Trigger Timing / Events
- Triggered when the user clicks a "Trigger Workflow" button bound to this workflow.
- Triggered via API by calling `workflows:trigger` (global custom context) or `<collection>:trigger` (collection-bound context) with the `triggerWorkflows` parameter.
- Supports both synchronous and asynchronous execution modes (determined by the workflow's `sync` property).

## Configuration Items
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| type | number | 0 | Yes | Context type: `0` Global custom data, `1` Single record, `2` Multiple records. |
| collection | string | - | Required when type is 1 or 2 | The data table where the trigger data resides, format is `"<dataSource>:<collection>"` (e.g., `"posts"` / `"mysql:orders"`; `dataSource` can be omitted when using the main data source). Not required when type is `0` (Global). |
| appends | string[] | [] | No | Paths of associated fields to preload (only effective when a collection is bound). See [Common Conventions - appends](../conventions/index.md#the-appends-field-in-trigger-and-node-configuration). |

## Context Type Details

### Global Custom Data (type = 0)
- Does not depend on a specific data table; can be used on buttons anywhere.
- Custom JSON data is passed as the trigger data when triggered.
- Suitable for operational scenarios that are not associated with specific records.

### Single Record (type = 1)
- Must be bound to a data table; used in form, detail block, or table row action buttons.
- Loads the specified record data when triggered and merges it with form submission data.
- Supports preloading associated data via `appends`.

### Multiple Records (type = 2)
- Must be bound to a data table; used in batch action buttons in table blocks.
- Loads multiple records in bulk via `filterByTk` when triggered; the trigger data is an array.

## Synchronous Execution and Interception
- When the workflow is set to synchronous execution, the flow completes synchronously within the request.
- If a synchronous flow fails or is terminated by an "End Process" node (with failure status), the request is intercepted and an error message is returned.
- Asynchronous flows execute in the background after the request completes and do not intercept the request.

## UI Action Configuration

This event always requires a UI button when users trigger it from the application interface. The workflow will not become visible to end users until a supported `Trigger workflow` button is added and bound.

- If the page-side button does not exist yet, use:
  - [UI builder recipe - forms and actions](../../../nocobase-ui-builder/references/recipes/forms-and-actions.md)
  - [UI builder settings - add-action](../../../nocobase-ui-builder/references/settings.md#add-action)
  - [UI builder settings - add-record-action](../../../nocobase-ui-builder/references/settings.md#add-record-action)
- The workflow must be enabled before it can be selected in the binding dialog.
- API calls using `workflows:trigger` or `<collection>:trigger` do not need any UI button configuration.

### Global Custom Data (`type = 0`)

Use this when the action does not depend on a specific record.

- Typical button locations:
  - Action panels / workbench entries.
  - Data-block action bars that support `Trigger workflow`, such as list, grid-card, table, calendar, kanban, or gantt actions.
- Binding flow:
  1. Add a `Trigger workflow` button in a supported action bar.
  2. Open the button settings and choose `Bind workflows`.
  3. Select one or more enabled `custom-action` workflows whose context type is global custom data.
  4. Optionally provide JSON `Context data` in the binding dialog. This JSON becomes `$context.data` at runtime.

### Single Record (`type = 1`)

Use this when the workflow should receive one record as trigger data.

- Typical button locations:
  - Create/edit forms.
  - Details blocks.
  - Table/list/grid-card record actions.
- Important behavior:
  - This is still a `Trigger workflow` button, not a submit/save binding. On create/edit forms it triggers the workflow directly and does not save the form automatically unless the workflow or surrounding UI handles that separately.
- Binding flow:
  1. Add a `Trigger workflow` button to the target form or record-action area.
  2. Open `Bind workflows`.
  3. Add a binding row.
  4. In the workflow field, select the enabled `custom-action` workflow whose `config.collection` matches the selected context collection.

### Multiple Records (`type = 2`)

Use this for batch actions on selected rows.

- Supported UI location:
  - Table block action bar only.
- Button creation flow:
  1. Add a `Trigger workflow` button to the table action bar.
  2. When prompted for context type during button creation, choose `Multiple records`.
  3. Open `Bind workflows` and select enabled `custom-action` workflows whose context type is multiple records and whose `config.collection` matches the table collection.
- Runtime note:
  - Users must select one or more rows before clicking the button, otherwise the workflow has no records to trigger with.

## Example Configuration

### Global Custom Data
```json
{
  "type": 0
}
```

### Single Record
```json
{
  "type": 1,
  "collection": "posts",
  "appends": ["category", "author"]
}
```

### Multiple Records
```json
{
  "type": 2,
  "collection": "mysql:orders"
}
```

## Recommended End-to-End Setup

1. Create the workflow with trigger type `custom-action`.
2. Choose the correct context type first; this determines where the workflow can be bound later.
3. For `type = 1` or `type = 2`, set `collection` and any needed `appends`.
4. Enable the workflow.
5. Return to the target page/block, add the correct `Trigger workflow` button, and bind the workflow.
6. Test the button from the actual UI, including row-selection requirements for batch actions and any expected synchronous error handling.

## Output Variables
The variable selector for this trigger is a tree array of `{ label, value, children? }`. At runtime, join the `value` segments with `.` and prepend `$context`.

- Exposed roots: `data`, `user`, `roleName`.
- In global custom-data mode, `data` is exposed as a single raw object value with no predefined child field tree. Should use JSON variable mapping or JSON query node to extract specific fields.
- In single-record or multiple-record mode with a bound collection, `data` expands to that collection's fields; configured `appends` become nested children under `data`.
- `user` follows the `users` collection schema; `roleName` is a scalar string.
- Example references: `{{$context.data}}`, `{{$context.data.title}}`, `{{$context.user.nickname}}`, `{{$context.roleName}}`.
