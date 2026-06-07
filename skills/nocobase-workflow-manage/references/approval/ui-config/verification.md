---
title: Approval UI Verification
description: Readback and limitation checklist for approval UI authoring.
---

# Approval UI Verification

After any approval UI write, verify both the FlowModel tree and the bound workflow/node config before moving on. Do not batch all verification at the end of workflow creation; a missing or empty approval popup should be caught immediately after the surface write that should have created it.

## Full Approval Workflow Verification Order

For a complete approval workflow build:

1. After approval trigger config is saved, read the workflow and confirm `workflow.config.collection` is set.
2. After `applyApprovalBlueprint(surface="initiator")`, read the initiator surface with `flowSurfaces:get`.
3. Confirm the initiator form contains business-required applicant fields, not just an empty `ApplyFormModel`.
4. After each approval node config is saved, read that node and confirm it is type `approval`.
5. After `applyApprovalBlueprint(surface="approver")` for that node, read the approver surface with `flowSurfaces:get`.
6. Confirm `approvalInformation` contains original-submission review fields required for the business decision.
7. Confirm `approvalApprover` contains the expected process actions and any required approver-editable fields.
8. Re-read the workflow/node and confirm the `approvalUid` field exists, is non-empty, points to the returned root, and action-derived runtime config is synchronized.
9. Repeat steps 4-8 for every approval node before reporting the workflow complete.
10. Run `scripts/validate-approval-workflow-ui.mjs --workflow-id <workflowId>` as the final completion gate. If it fails, repair the missing surface/block/action/field and rerun it.

For business-critical fields, add `--expect-initiator-field`, `--expect-information-field`, and `--expect-approver-field` arguments so the final gate checks more than non-empty field counts.

## FlowModel Readback

- `initiator` should read back a trigger approval page tree under `TriggerChildPageModel`.
- Complete initiator surfaces should include an `ApplyFormModel` created from `approvalInitiator`; helper blocks alone are incomplete.
- `approver` should read back an approval page tree under `ApprovalChildPageModel`.
- Complete approver surfaces should include both `ApprovalDetailsModel` (`approvalInformation`) and `ProcessFormModel` (`approvalApprover`).
- `taskCard` should read back an approval task-card details tree under the correct task-card root model.
- Page-like approval grids may now include `markdown` or `jsBlock` nodes when the write intentionally added them.
- Existing task-card/details layout edits should keep the same root binding and update only the details-grid layout.
- `approvalInitiator` should still own one `ApplyFormSubmitModel` unless the user explicitly removed or replaced that surface subtree.
- `approvalInitiator` should contain applicant-facing fields that cover the workflow's business purpose; an empty applicant form fails verification.
- `approvalInformation` should expose the original submitted collection data as read-only review context for the approver.
- `approvalInformation` should include enough business fields for the approver to understand what is being approved; an empty details block fails verification.
- `approvalApprover` should own the process actions and any fields the approver is expected to edit before submitting the handling result.
- If the business process requires approver-editable data, those fields should be present in `approvalApprover`; do not hide them in `approvalInformation` or omit them.
- Approval forms should preserve `PatternFormFieldModel` inner nodes.
- Approval association field switches should update `stepParams.fieldBinding.use` to the selected live-supported component.
- Approval details wrappers should stay in their approval details item model family.

## Runtime Config Readback

- `workflow.config.approvalUid` or `node.config.approvalUid`
- `workflow.config.taskCardUid` or `node.config.taskCardUid`
- The required `approvalUid` field must exist on the owner config; a detached FlowModel tree without this owner binding is not valid completion evidence.
- No newly authored legacy v1 UI bindings such as `workflow.config.applyForm` or `node.config.applyDetail`
- `workflow.config.withdrawable` when withdraw is present or removed
- `node.config.actions` when approver actions changed
- `node.config.returnTo` / `node.config.returnToNodeVariable` when return settings changed
- `node.config.toDelegateReassignees*` and `node.config.toAddReassignees*` when reassignee scopes changed

## Current Limitations

- v1 does not support this schema wiring; legacy `applyForm` / `applyDetail` bindings are not valid completion evidence.
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
- If `approvalUid` exists but `flowSurfaces:get` shows an empty or wrong-family tree, rerun the correct `applyApprovalBlueprint` route for that owner; do not treat the UID itself as success.
- If form/detail records were created but `workflow.config.approvalUid` or `node.config.approvalUid` is missing, rerun `applyApprovalBlueprint` for the correct owner so the root uid is persisted back to config.
- If the workflow/node was wired through `applyForm` or `applyDetail`, rebuild the v2 surface through `applyApprovalBlueprint` and bind it with `approvalUid`; do not report the legacy binding as success.
- If the initiator surface is missing `ApplyFormModel` or `ApplyFormSubmitModel`, the applicant cannot submit from the approval popup.
- If an approver surface is missing `ApprovalDetailsModel`, the approver cannot reliably inspect the original submitted data.
- If an approver surface is missing `ProcessFormModel` or process actions, the approver cannot submit a handling result.
- Confirm the write path matched the request:
  - whole-surface bootstrap / replace -> `applyApprovalBlueprint`
  - existing-root localized edit -> incremental route, including `setLayout` for task-card/details layout-only changes
- If the user actually asked for an ordinary page, hand off to `nocobase-ui-builder`.
