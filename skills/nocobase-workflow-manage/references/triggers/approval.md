---
title: "Approval Events"
description: "Dedicated flow triggered by approval initiation, used for managing approval processes."
---

# Approval Events

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
| centralized | boolean | false | No | Whether to allow initiating approvals in the Pending Center; if `false`, approvals can only be initiated on data blocks/buttons. |
| audienceType | number | 1 | No | Scope of initiators: `0` Restricted (requires configuration of initiator scope), `1` Unrestricted (all visible users). |
| approvalUid | string | - | No | Initiator interface (v2 configuration uid). If no value already exists, resolve the shared UID helper path first, then run `node <resolved-path-to-uid.js>` and write the generated value into the config. |
| taskCardUid | string | - | No | uid for "My Applications" list card configuration. If no value already exists, resolve the shared UID helper path first, then run `node <resolved-path-to-uid.js>` and write the generated value into the config. |
| recordShowMode | boolean | false | No | Record display mode in flow: `false` Snapshot, `true` Latest data. |
| appends | string[] | [] | No | Paths of preloaded associated fields. See [Common Conventions - appends](../conventions/index.md#the-appends-field-in-trigger-and-node-configuration). |
| withdrawable | boolean | false | No | Whether to allow the initiator to withdraw (automatically generated from initiator interface configuration). |
| useSameTaskTitle | boolean | false | No | Whether to unify task titles across all approval nodes. |
| taskTitle | string | - | No | Unified task title (supports variable templates); effective only when `useSameTaskTitle=true`. |
| notifications | object[] | [] | No | Configuration for notifications upon approval completion (sent to the initiator). |
| notifications[].channel | string | - | Yes | Name of the notification channel (e.g., in-app message, email, etc.). |
| notifications[].templateType | string | template | No | Template type (`template` or `custom`). |
| notifications[].template | number | object | - | Yes | Template configuration: template ID or custom template structure (depending on the channel type). |

## UI Configuration Flow

Approval triggers usually need both workflow-side configuration and page-side entry configuration. Treat them as two separate surfaces:

- Trigger configuration inside the workflow canvas decides which collection is approved, where approvals may be initiated, and what initiator UI is available.
- Page/button configuration decides whether users can start that approval from a data block.

### 1. Configure the Initiator Interface in the Trigger

Open the trigger dialog and configure the initiator interface (`approvalUid`):

- For any UID-backed config value in this trigger, keep the existing value if one is already present. Otherwise resolve the shared helper path from [nocobase-utils UID generation](../../../nocobase-utils/references/uid/index.md) in the current workspace, then run `node <resolved-path-to-uid.js>`.
- Do not leave placeholder strings such as `uid-for-initiator-interface` or `uid-for-task-card` in the final workflow payload.
- Add at least one form block bound to the same collection. Without a form block, initiators cannot submit from the approval center or resubmit after withdrawal.
- Add Markdown blocks only as helpers; they do not replace the form.
- Configure action buttons inside that interface as needed, for example `Submit`, `Save draft`, and optionally `Withdraw`.
- `withdrawable` is derived from whether the initiator interface exposes withdrawal capability. This should be synced with the actual interface configuration.

This trigger-side initiator interface is used for approval-center initiation and re-submission after withdrawal. It does not replace binding a collection form button when approvals should start from a page data block.

### 2. Bind a Submit/Save Button for Data-Block Initiation

If users should start approvals from collection forms in the application UI, bind the workflow on a supported form button:

- Supported buttons:
  - Create-form `Submit`.
  - Edit-form `Submit`.
- Not supported:
  - `Trigger workflow` buttons. Those are for the `custom-action` trigger, not approval events.
- If the form or button does not exist yet, use:
  - [UI builder recipe - forms and actions](../../../nocobase-ui-builder/references/recipes/forms-and-actions.md)
  - [UI builder settings - add-action](../../../nocobase-ui-builder/references/settings.md#add-action)

<!-- TODO: Binding steps -->

### 3. Decide Whether the To-Do Center Is Also an Entry

- When `centralized = false`, approvals can only be initiated from bound data-block form buttons.
- When `centralized = true`, users can also initiate approvals from the to-do center by using the trigger-side initiator interface. No extra page button is required for that entry.

<!-- TODO: ### 4. Optional Processing / Tracking Surface -->

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
  ],
  "approvalUid": "<pre-generated uid if missing>",
  "taskCardUid": "<pre-generated uid if missing>"
}
```

Before finalizing a payload like the example above, generate missing UID values first:

- Locate `skills/nocobase-utils/scripts/uid.js` in the current workspace instead of assuming a document-relative path.
- Run `node <resolved-path-to-uid.js>`.

## Output Variables
The variable selector for this trigger is a tree array of `{ label, value, children? }`. At runtime, join the `value` segments with `.` and prepend `$context`, for example `{{$context.data.title}}`.

- Exposed roots: `data`, `applicant`, `approvalId`.
- `data` follows the approval collection schema; configured `appends` become nested children under `data`.
- `applicant` follows the `users` collection schema.
- `approvalId` is the scalar approval record ID.
- Example references: `{{$context.data.amount}}`, `{{$context.data.department.name}}`, `{{$context.applicant.nickname}}`, `{{$context.approvalId}}`.
