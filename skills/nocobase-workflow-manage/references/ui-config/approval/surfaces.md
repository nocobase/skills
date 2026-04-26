---
title: Approval Surface Authoring Reference
description: Per-surface FlowModel tree, owner config knobs, block / action / field constraints, and configure payload shapes grounded in the live approval code.
---

# Approval Surface Authoring Reference

This reference is the structural and behavioral source-of-truth for authoring approval initiator, approver, and task-card surfaces. Read it after [primitives.md](primitives.md) and before picking a payload shape from [blueprint.md](blueprint.md), [incremental.md](incremental.md), or [recipes.md](recipes.md).

Use these tables to map user intent (e.g. "添加撤回按钮", "增加退回到上一步", "支持转签到部门成员") to a concrete and code-supported authoring payload. **Do not invent block keys, action keys, configure keys, or enum values that do not appear here.** If a request cannot be expressed with these primitives, stop and report what is missing.

## Surface ↔ Owner ↔ Root ↔ Container

| Surface | Owner | Owner config that holds the root uid | Root FlowModel `use` | Tab `use` | Block grid `use` | Author with |
|---|---|---|---|---|---|---|
| `initiator` | approval workflow trigger | `workflow.config.approvalUid` | `TriggerChildPageModel` | `TriggerChildPageTabModel` | `TriggerBlockGridModel` | `applyApprovalBlueprint` (first time / replace) or incremental ops |
| `approver` | approval workflow node | `node.config.approvalUid` | `ApprovalChildPageModel` | `ApprovalChildPageTabModel` | `ApprovalBlockGridModel` | `applyApprovalBlueprint` (first time / replace) or incremental ops |
| `taskCard` (apply / 我的申请) | approval workflow trigger | `workflow.config.taskCardUid` | `ApplyTaskCardDetailsModel` | n/a | `ApplyTaskCardGridModel` | `applyApprovalBlueprint(surface="taskCard", workflowId=…)` or `setLayout` |
| `taskCard` (process / 我的待办) | approval workflow node | `node.config.taskCardUid` | `ApprovalTaskCardDetailsModel` | n/a | `ApprovalTaskCardGridModel` | `applyApprovalBlueprint(surface="taskCard", nodeId=…)` or `setLayout` |

The four root `use` values are the ones recognized as approval-surface roots by the server: `TriggerChildPageModel`, `ApprovalChildPageModel`, `ApplyTaskCardDetailsModel`, `ApprovalTaskCardDetailsModel`. Do not nest one approval root inside another.

## Initiator Surface (`TriggerChildPageModel`)

### Allowed children of `TriggerBlockGridModel`

| Block key (semantic) | Persisted `use` | Singleton? | Required init | Notes |
|---|---|---|---|---|
| `approvalInitiator` | `ApplyFormModel` | one per grid in practice; bootstrap auto-creates one | `dataSourceKey`, `collectionName` (must match `workflow.config.collection`) | Auto-creates default `ApplyFormSubmitModel` action; field wrapper is `PatternFormItemModel + PatternFormFieldModel` |
| `markdown` | static markdown block | reusable | none | Generic |
| `jsBlock` | JS block | reusable | none | Generic |

Other generic page block types (table, list, calendar, chart, iframe, dynamic-data blocks) are **not** valid here in this phase — do not bootstrap or compose them.

### Apply-form actions (`ApplyFormModel.subModels.actions`)

All three are singleton: at most one of each per `ApplyFormModel`. The server rejects a duplicate `addAction` with `flowSurfaces addAction approval action '<use>' already exists in 'ApplyFormModel'`.

| Action key | Persisted `use` | Auto-created? | Approval status set on click | Runtime visibility | Owner config side effect |
|---|---|---|---|---|---|
| `approvalSubmit` (发起 / 提交) | `ApplyFormSubmitModel` | yes — comes free with `approvalInitiator` | `SUBMITTED` | hidden once status ∈ `SUBMITTED / PROCESSING / APPROVED / REJECTED` | none |
| `approvalSaveDraft` (保存草稿) | `ApplyFormSaveDraftModel` | no — add when needed | `DRAFT` | hidden once status ∈ `SUBMITTED / PROCESSING / APPROVED / REJECTED`; available on `CreateNew` and editable `Edit` (`DRAFT`/`RETURNED`) modes | none |
| `approvalWithdraw` (撤回) | `ApplyFormWithdrawModel` | no — add when needed | `WITHDRAWN` | only renders while status is `SUBMITTED` | toggles `workflow.config.withdrawable` automatically (server sets `true` while this action exists, `false` when it is removed) |

Configurable `configure` keys for each apply-form action (read live from `flowSurfaces:catalog.node.configureOptions`):

- `confirm` — `{ enable: boolean, title: string, content: string }`. Default `enable: true` for all three.
- `assignValues` — only for `approvalSubmit` / `approvalSaveDraft`. Map of field path → value applied before persisting. **Not exposed for `approvalWithdraw`** (no field write on withdraw).
- `linkageRules` — array; reuse from generic action linkage rules.

Do not invent further per-action knobs; the client only renders what the catalog returns.

### Workflow-level config knobs that drive the initiator (`workflow.config`)

These belong to the approval trigger and are managed via `workflows:update` (and several are auto-synced by the blueprint). Source: `plugin-workflow-approval/src/client/trigger.tsx` `ApprovalTrigger.fieldset`.

| Field | Type / values | What it does | Touched by surface authoring? |
|---|---|---|---|
| `collection` | `"<dataSourceKey>.<collectionName>"` | The data collection the apply form binds to. Required at trigger creation; collection-resolution gate applies. | No — set when the workflow is created. The initiator block must be initialized with the **same** `collectionName` and `dataSourceKey`. |
| `mode` | `0` After saved · `1` Before saved | Snapshot timing. | No |
| `centralized` | `false` Data blocks only · `true` To-do center + data blocks | Where applicants find this workflow. | No |
| `audienceType` | applicant scope (e.g. all users, role-based) | Who can launch the workflow. | No |
| `recordShowMode` | `false` snapshot · `true` latest | What downstream surfaces show. | No |
| `appends` | string[] | Association preload for downstream nodes. | No |
| `useSameTaskTitle` / `taskTitle` | boolean / variable string | Title shared across approval nodes. | No |
| `notifications` | object | Done-notification config. | No |
| `approvalUid` | string (uid) | Bound `TriggerChildPageModel` root. | **Yes** — written by `applyApprovalBlueprint(surface="initiator")`. Never overwrite manually. |
| `taskCardUid` | string (uid) | Bound `ApplyTaskCardDetailsModel` root. | **Yes** — written by `applyApprovalBlueprint(surface="taskCard", workflowId=…)`. |
| `withdrawable` | boolean | Whether withdraw is allowed at runtime. | **Yes** — auto-derived from presence of `ApplyFormWithdrawModel` in the initiator surface. Do not flip it directly. |
| `applyForm` | string (uid, legacy v1) | Legacy apply-form binding. | No — leave alone unless explicitly migrating off v1. |

## Approver Surface (`ApprovalChildPageModel`)

### Allowed children of `ApprovalBlockGridModel`

| Block key (semantic) | Persisted `use` | Singleton? | Required init | Notes |
|---|---|---|---|---|
| `approvalApprover` | `ProcessFormModel` | typically one per grid | `dataSourceKey`, `collectionName` (must match workflow's trigger collection) | No actions auto-created — author each one. Field wrapper is `PatternFormItemModel + PatternFormFieldModel`. |
| `approvalInformation` | `ApprovalDetailsModel` | unique per grid | `dataSourceKey`, `collectionName` | Read-only details. Excludes: `rounds`, `latestRound`, `records`, `applicantRole`, `prevRecord`, `approval`, `user`, `createdBy`, `data`, `dataAfter`. Allows one-level drill-down into approval data. |
| `markdown` | static markdown block | reusable | none | Generic |
| `jsBlock` | JS block | reusable | none | Generic |

### Process-form actions (`ProcessFormModel.subModels.actions`)

All five are singleton.

| Action key | Persisted `use` | Approval status on click | Owner config side effect | Common configure keys |
|---|---|---|---|---|
| `approvalApprove` (通过 / 同意) | `ProcessFormApproveModel` | `APPROVED` (`2`) | adds `2` to `node.config.actions` | `commentFormUid`, `linkageRules` |
| `approvalReject` (拒绝) | `ProcessFormRejectModel` | `REJECTED` (`-1`) | adds `-1` to `node.config.actions` | `commentFormUid`, `linkageRules` |
| `approvalReturn` (退回) | `ProcessFormReturnModel` | `RETURNED` (`1`) | adds `1` to `node.config.actions`; rewrites `node.config.returnTo` and `node.config.returnToNodeVariable` from `approvalReturnNodeSettings` | `commentFormUid`, `linkageRules`, `approvalReturn` (the return target — see below) |
| `approvalDelegate` (转签) | `ProcessFormDelegateModel` | `DELEGATED` (`8`) | adds `8` to `node.config.actions`; rewrites `node.config.toDelegateReassignees` and `node.config.toDelegateReassigneesOptions` | `assigneesScope`, `linkageRules` |
| `approvalAddAssignee` (加签) | `ProcessFormAddAssigneeModel` | `ADDED` (`99`) | adds `99` to `node.config.actions`; rewrites `node.config.toAddReassignees` and `node.config.toAddReassigneesOptions` | `assigneesScope`, `linkageRules` |

`node.config.actions` is always re-derived as the intersection of `[2, -1, 1, 8, 99]` with the action-uses currently present, in that fixed display order. **Do not write `actions` by hand.**

### `configure.approvalReturn` (return-target schema)

Allowed shapes — these are the only `type` values the server understands. Anything else collapses to `start`.

```jsonc
// 1) "返回流程起点" — return to where the workflow began
{ "approvalReturn": { "type": "start" } }
// → returnTo: null, returnToNodeVariable: null

// 2) "返回任意上游节点" — caller picks any upstream at runtime
{ "approvalReturn": { "type": "any" } }
// → returnTo: -1, returnToNodeVariable: null

// 3) "退回 N 步" — counted upstream steps
{ "approvalReturn": { "type": "count", "count": 1 } }
// count must be a positive number; otherwise the server clamps to 1
// → returnTo: <count>, returnToNodeVariable: null

// 4) "退回到指定上游节点" — pin to a specific upstream node
{ "approvalReturn": { "type": "specific", "target": "<upstreamNodeKey>" } }
// → returnTo: "<nodeKey>", returnToNodeVariable: "{{$jobsMapByNodeKey.<nodeKey>}}"
```

`<upstreamNodeKey>` must be the `key` (short random string) of an upstream node that already exists when the approval node executes. Never invent a key — read it from the workflow's nodes.

### `configure.assigneesScope` (delegate / add-assignee scope)

Both `approvalDelegate` and `approvalAddAssignee` use the same shape:

```jsonc
{
  "assigneesScope": {
    "assignees": [
      // user id
      123,
      // OR a filter that resolves to a user set at runtime; bare objects are auto-wrapped as { filter: <obj> }
      { "filter": { "$and": [ { "department": { "$includes": "{{currentUser.department}}" } } ] } }
    ],
    // delegate also supports an optional extra-field projection key
    "extraFieldKey": "departmentId"
  }
}
```

The server normalizes plain objects without a top-level `filter` key into `{ filter: <obj> }`, drops `null` / `''`, and keeps the rest verbatim. For `approvalAddAssignee`, `extraFieldKey` is **not** part of the runtime config write; pass it only when authoring delegate scopes.

### Approval-node config knobs (`node.config`)

These live on the approval node (managed via `flow_nodes:update`); some are set through the node's own configuration UI (the "ApproversInterfaceConfig" form) and some are reconciled by the surface.

Set through the node config UI (do **not** patch with `flowSurfaces`):

| Field | Type / values | What it controls |
|---|---|---|
| `assignees` | `Array<userId | { filter: … }>` | Who must approve. Order matters when `order: true`. |
| `negotiation` | object — quorum mode and parameters (per-cent / count / first-vote etc.) | Multi-assignee decision rule. |
| `order` | boolean — `true` sequential, `false` parallel | Assignee execution order. |
| `branchMode` | boolean | Whether the approval node owns approve/reject branches in the chain. |
| `endOnReject` | boolean | Only meaningful when `branchMode === true`. Stops the workflow on reject. |
| `title` | variable template (default `'{{useNodeContext().title}}'`) | Displayed task title. |

Reconciled by the approver surface (do **not** write directly — let `applyApprovalBlueprint` / `addAction` / `configure` rewrite them):

| Field | Set from |
|---|---|
| `approvalUid` | `applyApprovalBlueprint(surface="approver", nodeId=…)` |
| `taskCardUid` | `applyApprovalBlueprint(surface="taskCard", nodeId=…)` |
| `actions` | derived from `ProcessForm*Model` action uses present in the surface |
| `returnTo`, `returnToNodeVariable` | derived from the return action's `approvalReturn` settings |
| `toDelegateReassignees`, `toDelegateReassigneesOptions` | derived from the delegate action's `assigneesScope` |
| `toAddReassignees`, `toAddReassigneesOptions` | derived from the add-assignee action's `assigneesScope` |

## Task-Card Surfaces

Task cards are details surfaces; they are not pages. They use `fields + layout`, never `blocks`.

| Owner | Root `use` | Grid `use` | Allowed item wrappers |
|---|---|---|---|
| workflow trigger | `ApplyTaskCardDetailsModel` | `ApplyTaskCardGridModel` | `ApplyTaskCardDetailsItemModel`, `TaskCardDetailsAssociationFieldGroupModel`, `TaskCardCommonItemModel` |
| approval node | `ApprovalTaskCardDetailsModel` | `ApprovalTaskCardGridModel` | `ApprovalTaskCardDetailsItemModel`, `TaskCardDetailsAssociationFieldGroupModel`, `TaskCardCommonItemModel` |

Excluded fields on the apply card (the field initializer hides them): `rounds`, `latestRound`, `records`, `applicantRole`, `prevRecord`, `approval`, `user`, `createdBy`, `data`, `dataAfter`.

Configurable flows on the task-card root:
- `cardSettings.titleDescription` — `{ title, description }`
- `cardSettings.defaultParams` — auto-populate from `workflow.title`
- `detailsSettings.layout` — horizontal / vertical orientation
- `detailsSettings.refresh` — async field initialization

Layout-only edits to an existing task card use `setLayout` on the existing grid (`ApplyTaskCardGridModel` / `ApprovalTaskCardGridModel`); read the existing item uids from `flowSurfaces:get` first and pass them in `rowOrder` / `rows` / `sizes`.

## Field Wrappers and `fieldComponent`

| Container | Item wrapper `use` | Inner field `use` | Switching `fieldComponent` |
|---|---|---|---|
| `ApplyFormModel` (initiator), `ProcessFormModel` (approver) | `PatternFormItemModel` | `PatternFormFieldModel` | Read `flowSurfaces:catalog.node.configureOptions.fieldComponent.enum` on the wrapper, then `flowSurfaces:configure` with `changes.fieldComponent` |
| `ApprovalDetailsModel` | `ApprovalDetailsItemModel` | inherits details-item family | Same pattern |
| `ApplyTaskCardDetailsModel` | `ApplyTaskCardDetailsItemModel` | inherits details-item family | Same pattern |
| `ApprovalTaskCardDetailsModel` | `ApprovalTaskCardDetailsItemModel` | inherits details-item family | Same pattern |

Live association-component sets currently exposed by `fieldComponent.enum`:

- approval forms (initiator + approver), single-value relation: `RecordSelectFieldModel`, `RecordPickerFieldModel`, `SubFormFieldModel`
- approval forms, multi-value relation: `RecordSelectFieldModel`, `RecordPickerFieldModel`, `SubFormListFieldModel`, `PatternSubTableFieldModel`
- approval details and task-card details, single-value relation: `DisplayTextFieldModel`, `DisplaySubItemFieldModel`
- approval details and task-card details, multi-value relation: `DisplayTextFieldModel`, `DisplaySubListFieldModel`, `DisplaySubTableFieldModel`
- file-target relations keep the inferred default; nested subform / subtable variants are not exposed.

`jsItem` standalone fields are rejected under `ApplyFormModel` and `ProcessFormModel`. `addField` will not produce one.

## Scenario → Authoring Action Map

Use this to translate user intent into the smallest set of `flowSurfaces` operations. Always resolve the binding uid first when the request is incremental (see [primitives.md](primitives.md)).

### Initiator (发起人侧)

| User intent (CN / EN) | Surface | Operation | Payload essentials |
|---|---|---|---|
| 创建发起页 / build the apply page | `initiator` | `applyApprovalBlueprint` | `{ surface: "initiator", workflowId, blocks: [{ type: "approvalInitiator", resourceInit: { dataSourceKey, collectionName } , fields: [...] }], layout? }` |
| 替换整个发起页 / rebuild the apply page | `initiator` | `applyApprovalBlueprint` | same as above (`mode: "replace"` is the only mode) |
| 添加 / 删除草稿按钮 | `initiator` | `addAction` (add) on `ApplyFormModel` uid; or remove via the legacy node delete on the action uid | `{ target: { uid: "<applyForm-uid>" }, type: "approvalSaveDraft" }` |
| 添加撤回按钮 / 启用撤回 | `initiator` | `addAction` on `ApplyFormModel` uid | `{ target: { uid: "<applyForm-uid>" }, type: "approvalWithdraw" }` — server flips `workflow.config.withdrawable` to `true` |
| 关闭撤回 / 不允许撤回 | `initiator` | remove the `ApplyFormWithdrawModel` action node | server flips `workflow.config.withdrawable` back to `false` |
| 调整提交 / 草稿按钮的二次确认或字段赋值 | `initiator` | `configure` on the action uid | `{ target: { uid }, changes: { confirm: { enable, title, content } } }` or `{ changes: { assignValues: { …field: value… } } }` |
| 在发起页加一个说明 / 公告 | `initiator` | `addBlock` on `TriggerBlockGridModel` uid | `{ target: { uid: "<grid-uid>" }, type: "markdown" }` |
| 添加 / 删除发起表单中的字段 | `initiator` | `addField` (or generic remove on the wrapper uid) on `ApplyFormModel` uid | `{ target: { uid: "<applyForm-uid>" }, fieldPath: "<field>" }` |
| 切换发起表单中关联字段的组件 | `initiator` | `configure` on the field-wrapper uid | `{ target: { uid }, changes: { fieldComponent: "<RecordSelectFieldModel | …>" } }` (must come from live catalog enum) |
| 配置 / 重排我的申请卡片 | apply `taskCard` | `applyApprovalBlueprint` (first time) or `setLayout` (existing) | `{ surface: "taskCard", workflowId, fields: [...], layout? }` |

### Approver (审批人侧)

| User intent (CN / EN) | Surface | Operation | Payload essentials |
|---|---|---|---|
| 创建审批操作页 | `approver` | `applyApprovalBlueprint` | `{ surface: "approver", nodeId, blocks: [{ type: "approvalApprover", resourceInit: { dataSourceKey, collectionName }, fields: [...], actions: [...] }, { type: "approvalInformation", resourceInit: {…} }], layout? }` |
| 加同意按钮 | `approver` | `addAction` on `ProcessFormModel` uid | `{ target: { uid }, type: "approvalApprove" }` |
| 加拒绝按钮 | `approver` | `addAction` | `{ target: { uid }, type: "approvalReject" }` |
| 加退回按钮（默认退回起点） | `approver` | `addAction`, then optional `configure` | `{ target: { uid }, type: "approvalReturn" }` then `{ changes: { approvalReturn: { type: "start" } } }` |
| 退回到上一步 | `approver` | `configure` on the existing `approvalReturn` action | `{ changes: { approvalReturn: { type: "count", count: 1 } } }` |
| 退回任意上游节点（让审批人选） | `approver` | `configure` | `{ changes: { approvalReturn: { type: "any" } } }` |
| 退回到指定节点 | `approver` | `configure` | `{ changes: { approvalReturn: { type: "specific", target: "<upstreamNodeKey>" } } }` |
| 加转签按钮 | `approver` | `addAction` then `configure` for scope | `addAction { type: "approvalDelegate" }`; `configure { changes: { assigneesScope: { assignees: [...], extraFieldKey?: "…" } } }` |
| 加加签按钮 | `approver` | `addAction` then `configure` for scope | `addAction { type: "approvalAddAssignee" }`; `configure { changes: { assigneesScope: { assignees: [...] } } }` |
| 给某个审批动作加二次确认或前置赋值 | `approver` | `configure` | `{ changes: { confirm: {…} } }` or `{ changes: { assignValues: {…} } }` (on Approve/Reject; not all keys apply to every action — read catalog) |
| 在审批页加只读的申请详情 | `approver` | `addBlock` | `{ target: { uid: "<grid-uid>" }, type: "approvalInformation", resourceInit: { dataSourceKey, collectionName } }` |
| 增删审批表单字段 / 切换字段组件 | `approver` | `addField` / `configure` | same shape as initiator field operations |
| 配置 / 重排我的待办卡片 | process `taskCard` | `applyApprovalBlueprint(nodeId)` or `setLayout` | `{ surface: "taskCard", nodeId, fields: [...], layout? }` |

If a user asks to add a sixth approver action (anything outside Approve / Reject / Return / Delegate / AddAssignee), or a non-`markdown`/`jsBlock` generic block on a page-like approval grid, **stop** — these are not currently allowed and the server will reject the call.

## Pre-Flight Checklist

1. Identify the surface from owner type (workflow → initiator + apply task card; node → approver + process task card).
2. Resolve the owner record (`workflows:get` or `flow_nodes:get`) and read `approvalUid` / `taskCardUid`.
3. If the bound uid is empty, route to `applyApprovalBlueprint`. Otherwise route to incremental ops.
4. Before any incremental write that adds blocks, fields, or actions, call `flowSurfaces:catalog` on the target uid; treat its enums and singleton-filtering as the source of truth for what is currently legal.
5. Build the smallest payload that expresses the requested change. Do not duplicate work already auto-created by the blueprint (especially `approvalSubmit` on initiator).
6. Always read back with `flowSurfaces:get` and verify the matching owner-config side effects from the **Owner config side effect** column above.

## See Also

- [primitives.md](primitives.md) — root resolution, allowed containers, payload skeletons.
- [blueprint.md](blueprint.md) — first-time and replace flow.
- [incremental.md](incremental.md) — localized edits after the root exists.
- [recipes.md](recipes.md) — concrete end-to-end recipes from `workflowId` / `nodeId` / root `uid`.
- [verification.md](verification.md) — readback and limitation checklist.
