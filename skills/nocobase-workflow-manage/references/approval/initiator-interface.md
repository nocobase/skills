---
title: "Approval Initiator Interface"
description: "How the trigger-side initiator interface relates to data-block submit buttons and the To-Do Center entry."
---

# Approval Initiator Interface

This document covers the **trigger-side** initiator surface — i.e. the page that lets a user start an approval. It only applies to the `approval` trigger; the approver-side surfaces are covered in [ui-config/index.md](ui-config/index.md).

Approval triggers usually need both **workflow-side** configuration and **page-side** entry configuration. Treat them as two separate surfaces:

- Trigger configuration inside the workflow canvas decides which collection is approved, where approvals may be initiated, and what initiator UI is available.
- Page/button configuration decides whether users can start that approval from a data block.

## 1. Configure the Initiator Interface in the Trigger

Open the trigger dialog and configure the initiator interface (`approvalUid`):

- For UID handling, follow [uid-config.md](uid-config.md). Do not invent placeholder UIDs.
- Add at least one form block bound to the same collection. Without a form block, initiators cannot submit from the approval center or resubmit after withdrawal.
- Add Markdown blocks only as helpers; they do not replace the form.
- Configure action buttons inside that interface as needed, for example `Submit`, `Save draft`, and optionally `Withdraw`.
- `withdrawable` (on the trigger config) is derived from whether the initiator interface exposes withdrawal capability. This should be synced with the actual interface configuration.

This trigger-side initiator interface is used for approval-center initiation and re-submission after withdrawal. It does not replace binding a collection form button when approvals should start from a page data block.

For the structural authoring (which blocks / actions / fields are allowed, what `applyApprovalBlueprint` produces, how to do localized edits), read [ui-config/index.md](ui-config/index.md) and [ui-config/surfaces.md](ui-config/surfaces.md).

## 2. Bind a Submit/Save Button for Data-Block Initiation

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

## 3. Decide Whether the To-Do Center Is Also an Entry

- When `centralized = false`, approvals can only be initiated from bound data-block form buttons.
- When `centralized = true`, users can also initiate approvals from the to-do center by using the trigger-side initiator interface. No extra page button is required for that entry.

<!-- TODO: Optional Processing / Tracking Surface -->
