---
title: Approval UI Blueprint Route
description: Whole-surface bootstrap and replace flow for approval initiator, approver, and task-card surfaces.
---

# Approval UI Blueprint Route

Use `flowSurfaces:applyApprovalBlueprint` whenever the request is about first-time setup or whole-surface replacement of an approval UI.

This is a transport-neutral route. Fix this route first, then execute it through CLI, MCP, or direct HTTP.

For page-like approval surfaces, block legality is finalized by the downstream `compose(..., mode="replace")` path. `applyApprovalBlueprint` keeps structural validation, owner binding, and `template` rejection; it is not a second static approval-only block whitelist.

Read [primitives.md](primitives.md) first before building the payload.

## Binding Rules

| Surface | Required identifiers | Accepts | Rejects |
|---|---|---|---|
| `initiator` | `workflowId` | `blocks + layout` | `nodeId`, `fields` |
| `approver` | `nodeId` | `blocks + layout` | `workflowId`, `fields` |
| `taskCard` | exactly one of `workflowId` or `nodeId` | `fields + layout` | `blocks`, both ids together, neither id |

## Authoring Sequence

1. Resolve the target approval workflow or approval node.
2. Build one approval blueprint payload.
3. Call `flowSurfaces:applyApprovalBlueprint`.
4. Read back the created surface through `flowSurfaces:get`.
5. Verify the binding field on workflow/node config and any approval runtime config that should have changed.

## What This Route Does

- Creates or reuses the approval-bound root FlowModel.
- Persists `approvalUid` or `taskCardUid` back to workflow/node config.
- Replaces the target approval surface subtree in one write.
- Reconciles approval runtime config derived from approval actions.

## What This Route Does Not Do

- It does not perform legacy schema wiring.
- It does not replace localized follow-up edits; use the incremental route after the approval root already exists.

## Minimal Payload Shape

```json
{
  "version": "1",
  "mode": "replace",
  "surface": "initiator | approver | taskCard",
  "workflowId": 1,
  "nodeId": 10,
  "blocks": [],
  "fields": [],
  "layout": {}
}
```

Use only the fields allowed by the selected `surface`.

## Block Scope

- `initiator` and `approver` may use approval blocks plus the fixed generic blocks currently supported on page-like approval grids: `markdown`, `jsBlock`.
- `taskCard` still rejects `blocks` and stays on `fields + layout`.
- Do not assume that other generic blocks are valid just because `markdown` and `jsBlock` are.
- `blocks[].template` is still rejected on this route.

## Side Effects To Expect

- `initiator` blueprints auto-create the default submit action through `approvalInitiator`; do not model a second `approvalSubmit` just to obtain the default button.
- `initiator` blueprints may update `workflow.config.withdrawable`.
- `approver` blueprints may update approval-node runtime config such as `actions`, `returnTo`, and reassignee scopes.
- `taskCard` blueprints update `taskCardUid` on the bound workflow or node.
