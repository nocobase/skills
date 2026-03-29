---
title: "Custom Action Event"
description: "Manually trigger flows via a 'Trigger Workflow' button, supporting three context types: global custom data, single record, and multiple records."
---

# Custom Action Event

## Trigger Type

`custom-action`
Please use the `type` value above to create the trigger; do not use the documentation filename as the type.

## Use Cases
- Manually triggering flows via a "Trigger Workflow" button in the UI, rather than by data changes or built-in action buttons.
- When built-in CRUD operations cannot meet business requirements and a series of complex operational logic needs to be defined through a workflow.
- Binding custom workflows to form submissions, record row actions, or global buttons.

## Trigger Timing / Events
- Triggered when the user clicks a "Trigger Workflow" button bound to this workflow.
- Triggered via API by calling `workflows:trigger` (global custom context) or `<collection>:trigger` (collection-bound context) with the `triggerWorkflows` parameter.
- Supports both synchronous and asynchronous execution modes (determined by the workflow's `sync` property).

## Configuration Items
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| type | number | 0 | Yes | Context type: `0` Global custom data, `1` Single record, `2` Multiple records. |
| collection | string | - | Required when type is 1 or 2 | The data table where the trigger data resides, format is `"<dataSource>:<collection>"` (e.g., `"posts"` / `"mysql:orders"`; `dataSource` can be omitted when using the main data source). Not required when type is `0` (Global). |
| appends | string[] | [] | No | Paths of associated fields to preload (only effective when a collection is bound). |

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

## Trigger Variables
- `$context.data`: The trigger data.
  - Global mode: Custom JSON data submitted by the user.
  - Single record mode: Record data (including associated data preloaded via `appends`).
  - Multiple records mode: An array of record data.
- `$context.user`: The user who triggered the operation (sanitized user information).
- `$context.roleName`: The role name of the user who triggered the operation.

## Synchronous Execution and Interception
- When the workflow is set to synchronous execution, the flow completes synchronously within the request.
- If a synchronous flow fails or is terminated by an "End Process" node (with failure status), the request is intercepted and an error message is returned.
- Asynchronous flows execute in the background after the request completes and do not intercept the request.

## UI Action Configuration

This event requires adding a "Trigger Workflow" button in a block that supports it and binding the workflow before users can use it. API calls do not require this configuration.

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
