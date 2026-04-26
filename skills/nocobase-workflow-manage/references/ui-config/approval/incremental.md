---
title: Approval UI Incremental Editing
description: Localized editing flow for an approval surface after the approval root already exists.
---

# Approval UI Incremental Editing

Use this route only after the approval root already exists. If you do not know the target `uid` yet, resolve it from the owning workflow or approval node first.

This is a transport-neutral route. Fix this route first, then execute it through CLI, MCP, or direct HTTP.

Read [primitives.md](primitives.md) first before choosing payload shapes. Then read [surfaces.md](surfaces.md) for every per-action `configure` payload (especially `approvalReturn` and `assigneesScope`), the singleton-action map, the auto-derived owner-config side effects, and the user-intent → operation scenario map.

## Allowed Operations

- `workflows:get` to resolve `workflow.config.approvalUid` or `workflow.config.taskCardUid`
- `flow_nodes:get` to resolve `node.config.approvalUid` or `node.config.taskCardUid`
- `flowSurfaces:get` to inspect the existing root or child node
- `flowSurfaces:catalog` to discover approval blocks / fields / actions and the live `fieldComponent` enum exposed on approval wrappers
- `flowSurfaces:addBlock` for approval blocks
- `flowSurfaces:addField` for approval form/details fields
- `flowSurfaces:addAction` for approval actions
- `flowSurfaces:compose` for batched localized edits under an existing approval root
- `flowSurfaces:configure` for approval action settings and common UI settings
- `flowSurfaces:setLayout` for existing task-card/details grids and other approval-surface layout-only changes

## Resolve Root First

If the caller already has the approval root `uid`, use it directly. Otherwise resolve it with the owner record:

- Initiator incremental edit from `workflowId`
  - Read the workflow.
  - Use `workflow.config.approvalUid` as the approval root `uid`.
  - If it is empty, this is not an incremental edit yet; switch to `flowSurfaces:applyApprovalBlueprint(surface="initiator")`.
- Approver incremental edit from `nodeId`
  - Read the node.
  - Use `node.config.approvalUid` as the approval root `uid`.
  - If it is empty, switch to `flowSurfaces:applyApprovalBlueprint(surface="approver")`.
- Workflow task-card incremental edit from `workflowId`
  - Read the workflow.
  - Use `workflow.config.taskCardUid` as the approval root `uid`.
  - If it is empty, switch to `flowSurfaces:applyApprovalBlueprint(surface="taskCard")`.
- Node task-card incremental edit from `nodeId`
  - Read the node.
  - Use `node.config.taskCardUid` as the approval root `uid`.
  - If it is empty, switch to `flowSurfaces:applyApprovalBlueprint(surface="taskCard")`.

## Route Order

1. Resolve the approval root `uid` from workflow/node config when needed.
2. Read the current surface with `get`.
3. Read the local capability set with `catalog` when the task adds or changes blocks / fields / actions.
4. Apply one or more localized writes.
5. Read back with `get`.
6. Verify workflow/node config side effects.

For pure layout editing of an existing task-card/details surface:

1. Resolve the approval root `uid`.
2. Read the current surface with `get`.
3. Identify the existing details grid items from readback.
4. Call `flowSurfaces:setLayout` on the existing details grid.
5. Read back with `get`.
6. Verify the layout changed without replacing the whole surface.

## Hard Rules

- Never use `compose` to bootstrap a brand-new approval surface.
- If the owner record has no `approvalUid` / `taskCardUid`, do not guess a target `uid`; switch back to the blueprint route.
- Approval block keys are legal only under approval grids.
- Page-like approval grids may also expose the fixed generic block keys `markdown` and `jsBlock`; do not assume broader generic block support without reading the live catalog first.
- Approval action keys are legal only under their matching approval form containers.
- Approval forms do not allow standalone `jsItem`.
- Task-card remains block-forbidden.
- Do not bypass `flowSurfaces` and write raw FlowModel strings directly.

## Approval-Specific Semantics

- Approval form fields keep `PatternFormItemModel -> PatternFormFieldModel`.
- The actual field component use is stored in `stepParams.fieldBinding.use`.
- Association-field component switching must follow `catalog.node.configureOptions.fieldComponent.enum` on the live wrapper node.
- Current approval form relation component parity:
  - single-value relation -> `RecordSelectFieldModel`, `RecordPickerFieldModel`, `SubFormFieldModel`
  - multi-value relation -> `RecordSelectFieldModel`, `RecordPickerFieldModel`, `SubFormListFieldModel`, `PatternSubTableFieldModel`
  - file-target relations do not expose nested subform / subtable variants
- Current approval details / task-card relation display parity:
  - single-value relation -> `DisplayTextFieldModel`, `DisplaySubItemFieldModel`
  - multi-value relation -> `DisplayTextFieldModel`, `DisplaySubListFieldModel`, `DisplaySubTableFieldModel`
- Approval actions are singleton within one approval form / process form, and existing singleton actions disappear from later catalog reads.
- Initiator forms already contain a default `approvalSubmit` after `approvalInitiator` is created.
- `configure` supports approval-specific keys such as `approvalReturn` and `assigneesScope`.
- Existing task-card/details surfaces may use `setLayout` for grid reordering without falling back to `applyApprovalBlueprint`.

## When To Prefer Incremental Editing

- The user wants to add one more block, field, or action.
- The user wants to update one approval action setting.
- The user wants to switch an existing approval association field to another supported component exposed by the live wrapper contract.
- The user wants to reorder or re-layout an existing task-card/details surface without replacing it.
- The approval root already exists, or can be resolved from workflow/node config, and only a localized change is needed.
