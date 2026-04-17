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
2. Read [recipes.md](recipes.md) when you need a concrete end-to-end authoring recipe from `workflowId`, `nodeId`, or an existing root `uid`.
3. Then choose exactly one write route:
   - whole-surface bootstrap / replace -> [blueprint.md](blueprint.md)
   - existing approval root incremental edit -> [incremental.md](incremental.md)
4. Finish with [verification.md](verification.md).

## Decision Flow

1. Determine the surface:
   - `initiator`
   - `approver`
   - `taskCard`
2. Determine the owner input:
   - `workflowId`
   - `nodeId`
   - existing root `uid`
3. Resolve `approvalUid` / `taskCardUid` from owner config whenever the task is inspect or localized edit.
4. Choose the route:
   - missing binding, first-time setup, or replace -> `applyApprovalBlueprint`
   - existing binding plus localized change -> incremental route
5. Only after the route is fixed should you choose CLI, MCP, or direct HTTP.

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
- Page-like approval grids are approval-specific containers, but they may expose the fixed generic blocks that the live approval runtime currently supports: `markdown` and `jsBlock`.
- Task-card remains `fields + layout`; do not author blocks there.
- Ordinary Modern page / tab / popup editing belongs to `nocobase-ui-builder`, not this topic.
- v1 approval UI authoring does not cover schema wiring.

## Surface Summary

| Surface | Bound resource | Root family |
|---|---|---|
| `initiator` | approval workflow trigger | `TriggerChildPageModel` |
| `approver` | approval workflow node | `ApprovalChildPageModel` |
| `taskCard` | approval workflow trigger or approval workflow node | `ApplyTaskCardDetailsModel` / `ApprovalTaskCardDetailsModel` |

## Truth Layers

- Approval route selection and recipes: this folder.
- API request/response shape and examples: FlowSurfaces Swagger / OpenAPI.
- User-facing operation guide: `docs/docs/cn/plugins/@nocobase/plugin-workflow-approval/custom-ui.md`.
- Server design truth: `plugin-flow-engine/src/server/flow-surfaces/approval/README.md`.
- HTTP / MCP endpoint mapping only: `references/http-api/index.md`.
