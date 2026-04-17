---
title: Approval UI Verification
description: Readback and limitation checklist for approval UI authoring.
---

# Approval UI Verification

After any approval UI write, verify both the FlowModel tree and the bound workflow/node config.

## FlowModel Readback

- `initiator` should read back a trigger approval page tree under `TriggerChildPageModel`.
- `approver` should read back an approval page tree under `ApprovalChildPageModel`.
- `taskCard` should read back an approval task-card details tree under the correct task-card root model.
- Page-like approval grids may now include `markdown` or `jsBlock` nodes when the write intentionally added them.
- Existing task-card/details layout edits should keep the same root binding and update only the details-grid layout.
- `approvalInitiator` should still own one `ApplyFormSubmitModel` unless the user explicitly removed or replaced that legacy subtree.
- Approval forms should preserve `PatternFormFieldModel` inner nodes.
- Approval relation field switches should update `stepParams.fieldBinding.use` to the selected live-supported component.
- Approval details wrappers should stay in their approval details item model family.

## Runtime Config Readback

- `workflow.config.approvalUid` or `node.config.approvalUid`
- `workflow.config.taskCardUid` or `node.config.taskCardUid`
- `workflow.config.withdrawable` when withdraw is present or removed
- `node.config.actions` when approver actions changed
- `node.config.returnTo` / `node.config.returnToNodeVariable` when return settings changed
- `node.config.toDelegateReassignees*` and `node.config.toAddReassignees*` when reassignee scopes changed

## Current Limitations

- v1 does not support schema wiring.
- Approval blocks do not appear in ordinary `BlockGridModel` catalogs.
- Page-like approval grids expose only the fixed generic blocks `markdown` and `jsBlock`; do not infer support for the full generic block catalog from that limited parity.
- Approval actions cannot be added to ordinary form blocks.
- Existing singleton approval actions may be absent from catalog because the current form already owns them.
- Approval form catalogs do not expose standalone `jsItem`.
- Task-card remains `fields + layout` and does not expose block authoring.
- Workflow or node dynamic-data blocks are still out of scope for this phase.
- Task-card details are recognized as details surfaces, but not exposed as standalone public block keys.

## If Verification Fails

- Re-read the bound workflow or node config before retrying.
- Confirm the write path matched the request:
  - whole-surface bootstrap / replace -> `applyApprovalBlueprint`
  - existing-root localized edit -> incremental route, including `setLayout` for task-card/details layout-only changes
- If the user actually asked for an ordinary page, hand off to `nocobase-ui-builder`.
