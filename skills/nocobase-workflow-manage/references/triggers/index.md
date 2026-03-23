---
title: Workflow Triggers
description: Detailed description of workflow trigger types, configuration items, and variable outputs.
---

# Workflow Triggers

## Basic Data

Configuration items and output variables vary depending on the trigger type. The trigger type is represented by the `type` field value. Configuration items are stored in the `config` field (JSON).

The `type` field is determined when the workflow is created and cannot be changed thereafter. To modify the trigger configuration, the corresponding interface must be called to update the `config` field.

## Variables Produced by Triggers

Some triggers can produce variables for use by subsequent nodes. Variables are referenced in the form `{{$context.<:variableName>}}`; please refer to the documentation of each trigger for specifics. If a variable points to a data table structure, its internal property paths match the data table field names.

Subsequent nodes can reference these variables in their configuration items based on business needs to achieve dynamic workflow logic.

## Usage Notes

* **Only type values explicitly listed in the documentation can be used**; other values will cause the workflow to be unrecognized.

## Trigger Documentation Directory

### Built-in Triggers

| Type Value | Name | Description |
|---|---|---|
| `collection` | Data Table Events | [collection.md](collection.md) |
| `schedule` | Scheduled Tasks | [schedule.md](schedule.md) |

### Extension Plugin Triggers

| Type Value | Name | Plugin | Description |
|---|---|---|---|
| `action` | Post-action Events | plugin-workflow-action-trigger | [action-trigger.md](action-trigger.md) |
| `webhook` | Webhook | plugin-workflow-webhook | [webhook-trigger.md](webhook-trigger.md) |
| `approval` | Approval | plugin-workflow-approval | [approval-trigger.md](approval-trigger.md) |
