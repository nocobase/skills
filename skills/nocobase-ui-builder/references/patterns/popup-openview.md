---
title: popup / openView
description: Common patterns for drawer, dialog, ChildPage, nested popup, and popup context propagation.
---

# popup / openView

## Applies to

- `AddNewActionModel`
- `EditActionModel`
- `ViewActionModel`
- popup pages and `ChildPageModel`
- nested drawer or dialog flows

## Minimal tree shape

A stable popup or openView flow usually includes:

1. an action model
2. `popupSettings.openView`
3. `subModels.page`
4. at least one tab under the page
5. a grid under the tab
6. at least one real business block under the grid

An action shell without page, tab, and grid does not count as usable.

Builder DSL boundary:

- current build spec supports `popup.pageUse + blocks`
- it does not support `popup.tabs` or `popup.layout.tabs`
- if the target popup truly needs multiple tabs, either write the flow tree directly or state that the builder DSL cannot express it yet

## Context sources

Common stable sources:

| Scenario | Stable source |
| --- | --- |
| row -> first popup | expand by the target collection's `filterTargetKey` from `ctx.record` |
| block inside popup page | `ctx.view.inputArgs.filterByTk` |
| second popup from a popup table row | take the current row's record key and pass it into the next `filterByTk` |
| details action that opens an associated record | use a deep expression such as `ctx.record.customer.id` only after the current details record is proven |

## Decision rules

- if `filterByTk` can be written explicitly, prefer the explicit path
- do not hardcode record popup `filterByTk` as `{{ctx.record.id}}`; expand by the live `filterTargetKey`
- `openView.pageModelClass` must match `subModels.page.use`
- popup page tab `use` must match the parent page model
- relation tables inside popup pages may only upgrade to `associationName + sourceId` after the parent-to-child resource is verified
- `associationName` must not be copied from a child-side `belongsTo` field name
- if the entrypoint is a clickable relation title column, prefer the native relation-column route from [clickable-relation-column.md](clickable-relation-column.md)
- in nested popup flows, every layer must explain where its input args come from
- popup blocks should assume they depend on `ctx.view.inputArgs`, not outer-layer context
- run [payload-guard.md](payload-guard.md) before writing popup/openView payloads
- through-table popup actions only need smoke verification when the user explicitly asks for runtime confirmation

## Common traps

- action exists without a real page, tab, and grid subtree
- `openView.pageModelClass` says `ChildPageModel` but `subModels.page.use` still says `PageModel`
- `subModels.page.use=ChildPageModel` but the tab still uses `PageTabModel`
- the first popup works, but the second popup still depends on outer `ctx.record`
- row record context and popup input args are mixed together
- child-side `belongsTo` filters use a bare association path plus scalar operator
- a child-side `belongsTo(parent)` field name is submitted directly as `associationName`
- deep relation expressions are declared successful without explanation
- popup page blocks depend on `ctx.view.inputArgs.filterByTk`, but the action never passes `filterByTk`
- "click relation title to open popup" is implemented through JS by default

## Done criteria

- action tree, page, tab, grid, and block are all persisted
- the source of record context is explainable at every popup layer
- if browser replay was not requested, report runtime context as "persisted but not smoke-tested"
- for through actions, do not treat "button exists" or "drawer opens" as final success without smoke verification

## Related docs

- [../blocks/table.md](../blocks/table.md)
- [../blocks/details.md](../blocks/details.md)
- [../blocks/create-form.md](../blocks/create-form.md)
- [../blocks/edit-form.md](../blocks/edit-form.md)
- [clickable-relation-column.md](clickable-relation-column.md)
- [payload-guard.md](payload-guard.md)
- [relation-context.md](relation-context.md)
- [record-actions.md](record-actions.md)
