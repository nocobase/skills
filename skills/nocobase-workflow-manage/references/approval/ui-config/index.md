---
title: Approval UI Authoring
description: Routing entry for approval initiator, approver, and task-card surfaces built through flowSurfaces.
---

# Approval UI Authoring

Use this topic when the user wants to configure a workflow approval trigger UI, approval node processing UI, or approval task card through `flowSurfaces`.

This folder is the canonical source for approval UI route selection. Keep transport choice separate:

1. classify the approval task
2. resolve the owner and binding uid
3. choose the approval route
4. execute that route through CLI, MCP, or HTTP
5. verify the owner config and FlowModel tree

## Read Order

1. Read [primitives.md](primitives.md) for root resolution, allowed containers, singleton action behavior, and payload authoring rules.
2. Read [surfaces.md](surfaces.md) for the per-surface FlowModel tree, owner config knobs, complete block / action / field constraints, per-action `configure` payload shapes, and the scenario → operation map (initiator submit / save-draft / withdraw, approver approve / reject / return / delegate / add-assignee, task cards).
3. Read [recipes.md](recipes.md) when you need a concrete end-to-end authoring recipe from `workflowId`, `nodeId`, or an existing root `uid`.
4. Then choose exactly one write route:
   - whole-surface bootstrap / replace -> [blueprint.md](blueprint.md)
   - existing approval root incremental edit -> [incremental.md](incremental.md)
5. Finish with [verification.md](verification.md).

## Decision Flow

1. If the task is to build a full approval workflow, expand it into required UI work before choosing a route:
   - one trigger-bound `initiator` surface for the approval workflow
   - one node-bound `approver` surface for every approval node
   - optional `taskCard` surfaces only after the required popup surfaces are covered
2. Determine the surface:
   - `initiator`
   - `approver`
   - `taskCard`
3. Determine the owner input:
   - `workflowId`
   - `nodeId`
   - existing root `uid`
4. Resolve `approvalUid` / `taskCardUid` from owner config whenever the task is inspect or localized edit.
5. Choose the route:
   - missing binding, first-time setup, or replace -> `applyApprovalBlueprint`
   - existing binding plus localized change -> incremental route
6. Only after the route is fixed should you choose CLI, MCP, or direct HTTP.

## Route Matrix

| Goal | Route | Read next |
|---|---|---|
| First-time bootstrap or replace of the initiator surface | `flowSurfaces:applyApprovalBlueprint` with `surface="initiator"` + `workflowId` | [blueprint.md](blueprint.md) |
| First-time bootstrap or replace of the approver surface | `flowSurfaces:applyApprovalBlueprint` with `surface="approver"` + `nodeId` | [blueprint.md](blueprint.md) |
| First-time bootstrap or replace of the task-card surface | `flowSurfaces:applyApprovalBlueprint` with `surface="taskCard"` + exactly one of `workflowId` or `nodeId` | [blueprint.md](blueprint.md) |
| Incremental edit after an approval root already exists, or after resolving the root uid from workflow/node config | `flowSurfaces:get|catalog|addBlock|addField|addAction|compose|configure|setLayout` | [incremental.md](incremental.md) |
| Final readback, limitation check, and runtime-config verification | Read-only verification | [verification.md](verification.md) |

## Hard Rules

- Whole-surface bootstrap / replace always uses `applyApprovalBlueprint`.
- `compose` is never the bootstrap entry for a brand-new approval surface.
- Incremental editing is allowed only after the approval root already exists. If you start from `workflowId` or `nodeId`, resolve `approvalUid` / `taskCardUid` from owner config first.
- Do not require the caller to know `approvalUid` / `taskCardUid` before authoring starts.
- Use v2 bindings only: trigger initiator UI must bind through `workflow.config.approvalUid`, and approval-node approver UI must bind through `node.config.approvalUid`. Do not create legacy `applyForm` / `applyDetail` bindings.
- Approval workflow creation must include UI authoring by default: build the trigger initiator surface and every approval-node approver surface unless the user explicitly says config-only.
- A complete initiator surface must contain an `approvalInitiator` / `ApplyFormModel` block with the default `approvalSubmit` action. `markdown`, `jsBlock`, and task-card config are not substitutes for the applicant submission form.
- A complete approver surface must contain both `approvalInformation` / `ApprovalDetailsModel` for read-only original submitted data and `approvalApprover` / `ProcessFormModel` for handling actions and approver-editable approval fields.
- Required blocks must also contain useful fields. Do not create empty applicant forms, empty read-only details, or empty approver forms; include fields that match the approval's business intent and that users need to submit, review, or process the approval.
- Do not treat `approvalInformation` as the approval handling form. Do not treat `approvalApprover` as the read-only source-of-truth view of the original submission.
- `approvalUid` / `taskCardUid` values are not enough. The bound FlowModel tree must be read back and must contain the expected models; an empty popup is failed verification.
- After each approval UI write, immediately run readback verification before moving on to the next trigger/node/surface.
- Page-like approval grids are approval-specific containers, but they may expose the fixed generic blocks that the live approval runtime currently supports: `markdown` and `jsBlock`.
- Task-card remains `fields + layout`; do not author blocks there.
- Ordinary Modern page / tab / popup editing belongs to `nocobase-ui-builder`, not this topic.
- v1 approval UI authoring and legacy schema bindings (`applyForm`, `applyDetail`) are out of scope and do not count as a completed approval UI.

## Surface Summary

| Surface | Bound resource | Root family |
|---|---|---|
| `initiator` | approval workflow trigger | `TriggerChildPageModel` |
| `approver` | approval workflow node | `ApprovalChildPageModel` |
| `taskCard` | approval workflow trigger or approval workflow node | `ApplyTaskCardDetailsModel` / `ApprovalTaskCardDetailsModel` |

## Truth Layers

- Approval route selection and recipes: this folder.
- Per-surface FlowModel tree, owner config knobs, allowed blocks / actions / fields, configure payload shapes, scenario map: [surfaces.md](surfaces.md).
- API request/response shape and examples: FlowSurfaces Swagger / OpenAPI.
- User-facing operation guide: `docs/docs/cn/plugins/@nocobase/plugin-workflow-approval/custom-ui.md`.
- Server design truth: `plugin-flow-engine/src/server/flow-surfaces/approval/README.md`.
- HTTP / MCP endpoint mapping only: [http-api/index.md](../../http-api/index.md).
