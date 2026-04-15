---
title: Workflow Triggers
description: Detailed description of workflow trigger types, configuration items, and variable outputs.
---

# Workflow Triggers

## Basic Data

Configuration items and output variables vary depending on the trigger type. The trigger type is represented by the `type` field value. Configuration items are stored in the `config` field (JSON).

The `type` field is determined when the workflow is created and cannot be changed thereafter. To modify the trigger configuration, the corresponding interface must be called to update the `config` field.

## Variables Produced by Triggers

Some triggers produce variables for use by subsequent nodes. In the UI, these variables are exposed as a tree array of `{ label, value, children? }`. `label` is only for display; the actual runtime expression is built from the `value` path.

For trigger variables, join the `value` path segments with `.` and prepend `$context`, for example `{{$context.data.title}}` or `{{$context.date}}`.

Each trigger document with an `Output Variables` section describes the exact tree roots it provides and shows example expressions.

Subsequent nodes can reference these variables in their configuration items based on business needs to achieve dynamic workflow logic.

## Usage Notes

* **Only type values explicitly listed in the documentation can be used**; other values will cause the workflow to be unrecognized.
* Variables are NOT supported in trigger configuration items. Only static values are allowed.

## Trigger Documentation Directory

### Built-in Triggers

| Type Value | Name | Description |
|---|---|---|
| `collection` | Data Table Events | [collection.md](collection.md) |
| `schedule` | Scheduled Tasks | [schedule.md](schedule.md) |

### Extension Plugin Triggers

| Type Value | Name | Plugin | Description |
|---|---|---|---|
| `action` | Post-action Events | plugin-workflow-action-trigger | [action.md](action.md) |
| `custom-action` | Custom Action Event | plugin-workflow-custom-action-trigger | [custom-action.md](custom-action.md) |
| `request-interception` | Pre-action Event | plugin-workflow-request-interceptor | [request-interception.md](request-interception.md) |
| `webhook` | Webhook | plugin-workflow-webhook | [webhook.md](webhook.md) |
| `approval` | Approval | plugin-workflow-approval | [approval.md](approval.md) |
