---
title: "Approval Events"
description: "Dedicated flow triggered by approval initiation, used for managing approval processes."
---

# Approval Events

Approval is a multi-surface subsystem (trigger + node + initiator/approver UI + notifications + UID-anchored schema). This page only covers the `approval` trigger schema. Cross-cutting topics live under [../approval/](../approval/index.md).

Important: configuring this trigger is not enough to produce a usable approval workflow. After saving an `approval` trigger, build the trigger-bound initiator surface with `flowSurfaces:applyApprovalBlueprint(surface="initiator", workflowId=...)`, then read it back and verify the surface contains `ApplyFormModel` and the default `ApplyFormSubmitModel`. Bind this v2 surface through `workflow.config.approvalUid`; do not use the legacy v1 `applyForm` field. A non-empty `approvalUid` without a FlowModel tree still renders as an empty initiator popup.

## Trigger Type

`approval`

## Use Cases
- Business scenarios requiring approval flows (reimbursement, procurement, leave, etc.).
- When there's a need to use approval-specific nodes and approval center capabilities within the flow.

## Trigger Timing / Events
- Triggered when an approval is created or submitted.
- Supports two modes: "approval before data saving" or "data saving before approval".

## Configuration Items
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| collection | string | - | Yes | The data table associated with the approval, format is `"<dataSource>:<collection>"` (main data source can be omitted). |
| mode | number | 0 | Yes | Trigger mode: `1` Approval before saving (data is written only after approval), `0` Approval after saving (data is written before entering approval). |
| centralized | boolean | false | No | Whether to allow initiating approvals in the Pending Center; if `false`, approvals can only be initiated on data blocks/buttons. See [initiator-interface.md - To-Do Center](../approval/initiator-interface.md#3-decide-whether-the-to-do-center-is-also-an-entry). |
| audienceType | number | 1 | No | Scope of initiators: `1` Unrestricted (any user that can see the workflow), `0` Restricted (whitelist required). When `0`, the whitelist must be populated separately through `approvalAudiences:replace`. See [approval/audience.md](../approval/audience.md). |
| approvalUid | string | - | No | Initiator interface (v2 configuration uid). See [approval/uid-config.md](../approval/uid-config.md). |
| taskCardUid | string | - | No | uid for "My Applications" list card configuration. See [approval/uid-config.md](../approval/uid-config.md). |
| recordShowMode | boolean | false | No | Record display mode in flow: `false` Snapshot, `true` Latest data. |
| appends | string[] | [] | No | Paths of preloaded associated fields. See [Common Conventions - appends](../conventions/index.md#the-appends-field-in-trigger-and-node-configuration). |
| withdrawable | boolean | false | No | Whether to allow the initiator to withdraw (automatically derived from the initiator interface configuration). See [initiator-interface.md](../approval/initiator-interface.md). |
| useSameTaskTitle | boolean | false | No | Whether to unify task titles across all approval nodes. |
| taskTitle | string | - | No | Unified task title (supports variable templates); effective only when `useSameTaskTitle=true`. |
| notifications | object[] | [] | No | Notifications sent to the **initiator** when an approval ends (approved / rejected / returned / canceled). Built-in template `type` for this surface is `done`. Entry shape, system vs custom templates, and channel-specific custom payloads are documented in [approval/notifications.md](../approval/notifications.md). |

## Cross-cutting References

- UI authoring (initiator interface schema, blocks/actions/fields, blueprint vs. incremental edits): [approval/ui-config/index.md](../approval/ui-config/index.md).
- Trigger-side initiator interface flow and data-block submit binding: [approval/initiator-interface.md](../approval/initiator-interface.md).
- Initiator audience whitelist (when `audienceType=0`): [approval/audience.md](../approval/audience.md).
- UID generation rules for `approvalUid` / `taskCardUid`: [approval/uid-config.md](../approval/uid-config.md).
- Notifications configuration (system templates vs. custom, channel-specific shapes): [approval/notifications.md](../approval/notifications.md).

## Example Configuration
```json
{
  "collection": "expenses",
  "mode": 0,
  "centralized": true,
  "audienceType": 1,
  "recordShowMode": false,
  "appends": ["details", "department"],
  "withdrawable": true,
  "useSameTaskTitle": true,
  "taskTitle": "Expense Approval: {{$context.data.title}}",
  "notifications": [
    {
      "channel": "in-app-message",
      "templateType": "template",
      "template": 1
    }
  ],
  "approvalUid": "<pre-generated uid if missing>",
  "taskCardUid": "<pre-generated uid if missing>"
}
```

Before finalizing the payload, generate any missing UID values per [approval/uid-config.md](../approval/uid-config.md).

## Output Variables
The variable selector for this trigger is a tree array of `{ label, value, children? }`. At runtime, join the `value` segments with `.` and prepend `$context`, for example `{{$context.data.title}}`.

- Exposed roots: `data`, `applicant`, `approvalId`.
- `data` follows the approval collection schema; configured `appends` become nested children under `data`.
- `applicant` follows the `users` collection schema.
- `approvalId` is the scalar approval record ID.
- Example references: `{{$context.data.amount}}`, `{{$context.data.department.name}}`, `{{$context.applicant.nickname}}`, `{{$context.applicant.id}}`,`{{$context.approvalId}}`.
