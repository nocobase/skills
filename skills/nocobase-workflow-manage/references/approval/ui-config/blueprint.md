---
title: Approval UI Blueprint Route
description: Whole-surface bootstrap and replace flow for approval initiator, approver, and task-card surfaces.
---

# Approval UI Blueprint Route

Use `flowSurfaces:applyApprovalBlueprint` whenever the request is about first-time setup or whole-surface replacement of an approval UI.

This is a transport-neutral route. Fix this route first, then execute it through CLI, MCP, or direct HTTP.

For page-like approval surfaces, block legality is finalized by the downstream `compose(..., mode="replace")` path. `applyApprovalBlueprint` keeps structural validation, owner binding, and `template` rejection; it is not a second static approval-only block whitelist.

Read [primitives.md](primitives.md) first before building the payload, then [surfaces.md](surfaces.md) for the exact block / action / field / configure shapes that this blueprint payload accepts per surface.

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
5. Verify the binding field on workflow/node config and any approval runtime config that should have changed. For `surface="initiator"`, `workflow.config.approvalUid` must exist and point to the returned root. For `surface="approver"`, `node.config.approvalUid` must exist and point to the returned root.

## What This Route Does

- Creates or reuses the approval-bound root FlowModel.
- Persists `approvalUid` or `taskCardUid` back to workflow/node config.
- Replaces the target approval surface subtree in one write.
- Reconciles approval runtime config derived from approval actions.

If the root FlowModel exists but the owning workflow/node config does not contain the matching `approvalUid`, the surface is detached and the approval popup will not use it. Do not report success until the owner config readback proves the binding was saved.

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

## Minimum Complete Blueprints

Use these as the baseline when the user asks to build a usable approval UI and does not explicitly request a partial surface. Replace the example field names with fields from the real trigger collection that are necessary for the workflow's business intent. Do not submit `fields: []` or a form/detail block with only irrelevant/system fields.

Initiator baseline:

```json
{
  "version": "1",
  "mode": "replace",
  "surface": "initiator",
  "workflowId": 1,
  "blocks": [
    {
      "type": "approvalInitiator",
      "resourceInit": {
        "dataSourceKey": "main",
        "collectionName": "expenses"
      },
      "fields": ["title", "amount", "reason"]
    }
  ]
}
```

The `approvalInitiator` block auto-creates `approvalSubmit`. Do not add helper-only blocks as the whole initiator surface, and do not create an empty applicant form. The form fields should be enough for the applicant to provide the data the approval is about.

Approver baseline:

```json
{
  "version": "1",
  "mode": "replace",
  "surface": "approver",
  "nodeId": 10,
  "blocks": [
    {
      "type": "approvalInformation",
      "resourceInit": {
        "dataSourceKey": "main",
        "collectionName": "expenses"
      },
      "fields": ["title", "amount", "reason"]
    },
    {
      "type": "approvalApprover",
      "resourceInit": {
        "dataSourceKey": "main",
        "collectionName": "expenses"
      },
      "fields": ["approvedAmount"],
      "actions": [
        { "type": "approvalApprove" },
        { "type": "approvalReject" }
      ]
    }
  ]
}
```

Use `approvalInformation` for read-only original submission review. Its fields should show the business data the approver needs to make a decision. Use `approvalApprover` for approval decisions and fields the approver may modify before submitting the handling result. If the process requires no approver-editable data fields, keep the process actions, but do not omit the read-only original-data fields.

## Side Effects To Expect

- `initiator` blueprints auto-create the default submit action through `approvalInitiator`; do not model a second `approvalSubmit` just to obtain the default button.
- `initiator` blueprints may update `workflow.config.withdrawable`.
- `approver` blueprints may update approval-node runtime config such as `actions`, `returnTo`, and reassignee scopes.
- `taskCard` blueprints update `taskCardUid` on the bound workflow or node.
