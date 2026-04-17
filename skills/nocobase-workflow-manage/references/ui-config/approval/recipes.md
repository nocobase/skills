---
title: Approval UI Recipes
description: Concrete approval-surface authoring recipes starting from workflowId, nodeId, or an existing approval root uid.
---

# Approval UI Recipes

Use these recipes when the user describes approval UI work in business language and does not provide the final `approvalUid` / `taskCardUid`.

Read [primitives.md](primitives.md) first. Then choose the closest recipe and keep the same route even if the transport changes.

## Recipe 1: Build an initiator surface from `workflowId`

Use when the user says things like:

- "Build an approval initiator form for workflow 123"
- "Rebuild the initiator surface for this approval workflow"

### Input

- `workflowId`
- desired initiator blocks / layout

### Sequence

1. Read the workflow to confirm it is an approval workflow trigger.
2. Decide whether this is first-time setup or whole-surface replace.
3. Call `flowSurfaces:applyApprovalBlueprint` with:
   - `surface: "initiator"`
   - `workflowId`
   - `blocks`
   - optional `layout`
4. Read back the created root with `flowSurfaces:get`.
5. Verify `workflow.config.approvalUid` now points to the returned root `uid`.
6. Verify the initiator form still owns the default submit action.

### Do not do

- Do not wait for the caller to provide `approvalUid`.
- Do not bootstrap this surface with `compose`.
- Do not add a second `approvalSubmit` just to recreate the default submit button.

## Recipe 2: Build an approver surface from `nodeId`

Use when the user says things like:

- "Build a processing surface for approval node 45"
- "Rebuild the approval form for this approval node"

### Input

- `nodeId`
- desired approver blocks / layout

### Sequence

1. Read the node to confirm it is an approval node.
2. Decide whether this is first-time setup or whole-surface replace.
3. Call `flowSurfaces:applyApprovalBlueprint` with:
   - `surface: "approver"`
   - `nodeId`
   - `blocks`
   - optional `layout`
4. Read back the created root with `flowSurfaces:get`.
5. Verify `node.config.approvalUid` now points to the returned root `uid`.
6. Verify any approval runtime config implied by process actions is synchronized.

### Do not do

- Do not hand this off to ordinary page authoring.
- Do not assume the full generic page block catalog is supported under the approval grid; in this phase only `markdown` and `jsBlock` are in scope beyond approval-specific blocks.
- Do not assume existing action singletons will still appear in catalog reads.

## Recipe 3: Edit an existing approver surface from `nodeId`

Use when the user says things like:

- "Add a return action to the approval surface for node 45"
- "Add an information block to the approval surface for node 45"
- "Change the delegate / return configuration on node 45"

### Input

- `nodeId`
- one localized approval UI change

### Sequence

1. Read the node.
2. Resolve `node.config.approvalUid`.
3. If the binding is empty, switch to Recipe 2 instead of inventing a root uid.
4. Read the existing root with `flowSurfaces:get`.
5. Read local capabilities with `flowSurfaces:catalog`.
6. Apply exactly the localized write needed:
   - `addBlock`
   - `addField`
   - `addAction`
   - `compose`
   - `configure`
7. Read back the surface again.
8. Verify both the FlowModel change and the matching node runtime-config fields.

### Do not do

- Do not call `applyApprovalBlueprint` for a purely localized change when the root already exists.
- Do not guess missing catalog items are always unsupported; they may already exist as singletons.
- Do not edit node config separately when the approval action write already owns that runtime-config sync.

## Recipe 4: Build a task-card surface from `workflowId` or `nodeId`

Use when the user says things like:

- "Configure an application card for this approval workflow"
- "Configure task-card details for this approval node"

### Input

- exactly one of `workflowId` or `nodeId`
- desired task-card fields / layout

### Sequence

1. Resolve whether the task-card belongs to the workflow trigger side or the approval node side.
2. Call `flowSurfaces:applyApprovalBlueprint` with:
   - `surface: "taskCard"`
   - exactly one owner id
   - `fields`
   - optional `layout`
3. Read back the created root with `flowSurfaces:get`.
4. Verify the owner now stores `taskCardUid`.
5. Verify the returned tree uses the correct approval task-card root family.

### Do not do

- Do not pass both `workflowId` and `nodeId`.
- Do not pass `blocks`; task-card blueprint uses `fields + layout`.
- Do not treat task-card details as an ordinary page block.

## Recipe 5: Re-layout an existing task-card/details surface

Use when the user says things like:

- "Reorder the fields on this approval card"
- "Change this task-card to a two-column layout"
- "Do not rebuild it; only change the existing details layout"

### Input

- one of `workflowId`, `nodeId`, or existing task-card root `uid`
- target layout for the existing details grid

### Sequence

1. Resolve the existing task-card root:
   - workflow side -> `workflow.config.taskCardUid`
   - node side -> `node.config.taskCardUid`
   - or use the provided root `uid`
2. If there is no existing `taskCardUid`, switch back to Recipe 4 instead of inventing a layout target.
3. Read the current surface with `flowSurfaces:get`.
4. Identify the current details grid and its child item UIDs from readback.
5. Call `flowSurfaces:setLayout` on that existing details grid.
6. Read back the surface again.
7. Verify the grid layout changed and the owner binding still points to the same root `uid`.

### Do not do

- Do not use `applyApprovalBlueprint(surface="taskCard")` for a pure layout-only edit on an existing task-card unless the user explicitly wants a full replace.
- Do not guess grid item UIDs; always read them from the live surface first.
- Do not use `catalog` as the primary discovery step when the task only reorders existing task-card/details items.

## Recipe 6: Switch an approval association field to another supported component

Use when the user says things like:

- "Switch the association field in this approval form to a subform"
- "Display the association field in approval details as a subtable"
- "Change this association field on the task-card back to text display"

### Input

- one existing approval field wrapper `uid`, or enough owner context to read the live surface and locate that wrapper
- the intended target component

### Sequence

1. Resolve the approval root if the caller only provides `workflowId` or `nodeId`.
2. Read the existing surface with `flowSurfaces:get`.
3. Locate the target field wrapper `uid`.
4. Read `flowSurfaces:catalog` on that wrapper and inspect `node.configureOptions.fieldComponent.enum`.
5. If the requested component is missing from that live enum, stop and report that it is not currently supported for this exact field.
6. Call `flowSurfaces:configure` on the wrapper `uid` with `changes.fieldComponent`.
7. Read back the wrapper again.
8. Verify the wrapper family stayed approval-specific and the selected component was persisted.

### Do not do

- Do not guess relation component support from ordinary page docs.
- Do not assume approval forms and approval details share the same component set.
- Do not expect file-target relations to expose nested subform / subtable variants.

## Quick Route Reminder

| Situation | Route |
|---|---|
| first-time setup or full replacement | `applyApprovalBlueprint` |
| existing root plus one localized edit | incremental route |
| existing task-card/details layout-only change | incremental route with `setLayout` |
| only owner id is known | resolve owner first, then choose route |
| ordinary Modern page request | hand off to `nocobase-ui-builder` |
