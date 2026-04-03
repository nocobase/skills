---
title: "Approval Events"
description: "Dedicated flow triggered by approval initiation, used for managing approval processes."
---

# Approval Events

## Trigger Type

`approval`
Please use the `type` value above to create the trigger; do not use the documentation filename as the type.

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
| centralized | boolean | false | No | Whether to allow initiating approvals in the Pending Center; if `false`, approvals can only be initiated on data blocks/buttons. |
| audienceType | number | 1 | No | Scope of initiators: `0` Restricted (requires configuration of initiator scope), `1` Unrestricted (all visible users). |
| applyForm | string | - | No | Initiator interface (v1 legacy UI Schema uid). |
| approvalUid | string | - | No | Initiator interface (v2 configuration uid). |
| taskCardUid | string | - | No | uid for "My Applications" list card configuration. |
| recordShowMode | boolean | false | No | Record display mode in flow: `false` Snapshot, `true` Latest data. |
| appends | string[] | [] | No | Paths of preloaded associated fields. See [Common Conventions - appends](../conventions/index.md#the-appends-field-in-trigger-and-node-configuration). |
| withdrawable | boolean | false | No | Whether to allow the initiator to withdraw (automatically generated from initiator interface configuration). |
| useSameTaskTitle | boolean | false | No | Whether to unify task titles across all approval nodes. |
| taskTitle | string | - | No | Unified task title (supports variable templates); effective only when `useSameTaskTitle=true`. |
| notifications | object[] | [] | No | Configuration for notifications upon approval completion (sent to the initiator). |
| notifications[].channel | string | - | Yes | Name of the notification channel (e.g., in-app message, email, etc.). |
| notifications[].templateType | string | template | No | Template type (`template` or `custom`). |
| notifications[].template | number | object | - | Yes | Template configuration: template ID or custom template structure (depending on the channel type). |

## Trigger Variables
- `$context.data`: The data record associated with the approval (inclusion of preloaded relationships depends on `appends` and `mode`).
- `$context.approvalId`: Approval record ID.
- `$context.applicant`: Initiator's user information.
- `$context.applicantRoleName`: Initiator's role name.

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
      "channel": "in-app",
      "templateType": "template",
      "template": 1
    }
  ]
}
```
