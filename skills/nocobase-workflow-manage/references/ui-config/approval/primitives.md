---
title: Approval UI Authoring Primitives
description: Approval surface root resolution, allowed containers, and payload authoring rules.
---

# Approval UI Authoring Primitives

Read this file before either the blueprint route or the incremental route. For the full per-surface tree, owner config knobs, complete block / action / field constraints, every per-action `configure` payload shape, and the user-intent → operation scenario map (submit / save-draft / withdraw on initiator; approve / reject / return / delegate / add-assignee on approver; task cards), read [surfaces.md](surfaces.md) immediately after this file.

Approval authoring starts owner-first. The caller may know only `workflowId` or `nodeId`; that is enough to begin. Root `uid` is an optimization, not a prerequisite.

## Root Resolution

If the request only gives `workflowId` or `nodeId`, resolve the existing approval root before any incremental write:

| Goal | Read owner | Binding field | Missing binding means |
|---|---|---|---|
| Initiator surface | `workflows:get` | `workflow.config.approvalUid` | switch to `applyApprovalBlueprint(surface="initiator")` |
| Approver surface | `flow_nodes:get` | `node.config.approvalUid` | switch to `applyApprovalBlueprint(surface="approver")` |
| Workflow task-card | `workflows:get` | `workflow.config.taskCardUid` | switch to `applyApprovalBlueprint(surface="taskCard")` |
| Node task-card | `flow_nodes:get` | `node.config.taskCardUid` | switch to `applyApprovalBlueprint(surface="taskCard")` |

Do not guess an approval root `uid`.

## Input Defaults

- `workflowId` is the default owner for `initiator` and workflow task-card authoring.
- `nodeId` is the default owner for `approver` and node task-card authoring.
- Existing root `uid` is valid only when the caller already has a bound approval surface and wants to inspect or edit that exact root.
- If the task is first-time setup or whole-surface replacement, owner resolution is still required, but root resolution is optional because `applyApprovalBlueprint` creates or reuses the correct root automatically.

## Surface Families

| Surface | Root family | Writable child container | Public block keys |
|---|---|---|---|
| `initiator` | `TriggerChildPageModel -> TriggerChildPageTabModel -> TriggerBlockGridModel` | `TriggerBlockGridModel` | `approvalInitiator`, `markdown`, `jsBlock` |
| `approver` | `ApprovalChildPageModel -> ApprovalChildPageTabModel -> ApprovalBlockGridModel` | `ApprovalBlockGridModel` | `approvalApprover`, `approvalInformation`, `markdown`, `jsBlock` |
| `taskCard` | `ApplyTaskCardDetailsModel` or `ApprovalTaskCardDetailsModel` | task-card details grid | no standalone public block keys |

`TriggerBlockGridModel` and `ApprovalBlockGridModel` are approval page-like block containers. They may host approval blocks plus the fixed generic blocks that the live approval runtime currently exposes there: `markdown` and `jsBlock`. Do not infer support for the full generic block catalog from that limited parity. `taskCard` stays block-forbidden.

## Block Authoring Rules

### `approvalInitiator`

- Persists as `ApplyFormModel`
- Allowed only under `TriggerBlockGridModel`
- Requires resource init: `dataSourceKey`, `collectionName`
- Creates `PatternFormGridModel`
- Auto-creates one default action: `approvalSubmit` / `ApplyFormSubmitModel`

### `approvalApprover`

- Persists as `ProcessFormModel`
- Allowed only under `ApprovalBlockGridModel`
- Requires resource init: `dataSourceKey`, `collectionName`
- Creates `PatternFormGridModel`
- Does not auto-create process actions

### `approvalInformation`

- Persists as `ApprovalDetailsModel`
- Allowed only under `ApprovalBlockGridModel`
- Requires resource init: `dataSourceKey`, `collectionName`
- Creates `ApprovalDetailsGridModel`

### Page-like generic blocks

- `markdown`
  - Allowed under `TriggerBlockGridModel` and `ApprovalBlockGridModel`
  - Follows the normal FlowSurfaces generic block path after approval root resolution
- `jsBlock`
  - Allowed under `TriggerBlockGridModel` and `ApprovalBlockGridModel`
  - Follows the normal FlowSurfaces generic block path after approval root resolution
- Do not assume other generic blocks such as `iframe`, `table`, `list`, workflow dynamic-data blocks, or node dynamic-data blocks are available in this phase unless the live catalog proves it.

## Action Authoring Rules

| Container | Public action keys |
|---|---|
| `ApplyFormModel` | `approvalSubmit`, `approvalSaveDraft`, `approvalWithdraw` |
| `ProcessFormModel` | `approvalApprove`, `approvalReject`, `approvalReturn`, `approvalDelegate`, `approvalAddAssignee` |

All approval actions are singleton per owning approval form.

Implications:

- `approvalInitiator` already owns one default `approvalSubmit`
- `flowSurfaces:catalog` hides any singleton approval action that already exists on the current form
- after `addAction` or `compose` creates `approvalSaveDraft`, `approvalApprove`, and similar actions, the same public key should disappear from the next catalog read
- do not treat missing action keys in catalog as unsupported when the form already contains that singleton action

## Field Authoring Rules

### Approval forms

- Wrapper use: `PatternFormItemModel`
- Inner field use: always `PatternFormFieldModel`
- Real field component use lives in `stepParams.fieldBinding.use`
- `addField` and `configure(fieldComponent)` must preserve this shape
- Standalone `jsItem` is not supported under approval forms
- For association fields, `configure(fieldComponent)` must use the live wrapper contract from `catalog.node.configureOptions.fieldComponent.enum`
- Current public relation component set:
  - single-value relation -> `RecordSelectFieldModel`, `RecordPickerFieldModel`, `SubFormFieldModel`
  - multi-value relation -> `RecordSelectFieldModel`, `RecordPickerFieldModel`, `SubFormListFieldModel`, `PatternSubTableFieldModel`
  - file-target relations keep the inferred default binding use instead of nested subform / subtable variants

### Approval details and task cards

- Wrappers stay in their approval-specific details item family
- They inherit details semantics, but do not collapse to generic page wrappers
- For association fields, `configure(fieldComponent)` must use the live wrapper contract from `catalog.node.configureOptions.fieldComponent.enum`
- Current public relation display set:
  - single-value relation -> `DisplayTextFieldModel`, `DisplaySubItemFieldModel`
  - multi-value relation -> `DisplayTextFieldModel`, `DisplaySubListFieldModel`, `DisplaySubTableFieldModel`

## Payload Skeletons

### Incremental `addBlock`

```json
{
  "target": { "uid": "approval-grid-uid" },
  "type": "approvalApprover",
  "resourceInit": {
    "dataSourceKey": "main",
    "collectionName": "expenses"
  }
}
```

### Incremental `addField`

```json
{
  "target": { "uid": "approval-form-or-details-uid" },
  "fieldPath": "amount"
}
```

### Incremental `addAction`

```json
{
  "target": { "uid": "process-form-uid" },
  "type": "approvalReturn"
}
```

### `configure` on approval actions

```json
{
  "target": { "uid": "return-action-uid" },
  "changes": {
    "approvalReturn": {
      "type": "count",
      "count": 1
    }
  }
}
```

`approvalDelegate` and `approvalAddAssignee` use `changes.assigneesScope`.

## Compose Guidance

Use `compose` only after the approval root already exists.

- `blocks[]` may contain approval public block keys plus the fixed page-like generic blocks currently exposed by the live approval catalog: `markdown`, `jsBlock`
- nested `fields[]` and `actions[]` follow the same block/action rules above
- always read `catalog` on the resolved approval grid first; treat that live result as the source of truth for block availability and `fieldComponent` switching
- for initiator blocks, do not add `approvalSubmit` only to recreate the default unless a legacy tree actually lost it
