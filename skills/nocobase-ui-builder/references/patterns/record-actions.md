---
title: Record actions
description: Tree structure and context rules for view, edit, approve, add-child, and other record-level actions.
---

# Record actions

## Applies to

- row actions in tables
- actions inside details blocks
- approve or reject flows
- add-child actions
- edit actions for relation records

## Decision rules

- if an action targets the current record, explain where the current record comes from
- if an action only opens popup or openView, continue through [popup-openview.md](popup-openview.md)
- if an action rewrites parent-child, through, or hierarchy relations, continue through [relation-context.md](relation-context.md)
- if the user explicitly asks for record-level edit popup, row actions inside `TableActionsColumnModel` count toward requirements and acceptance
- `DetailsBlockModel.actions` and `TableActionsColumnModel.actions` accept record-action uses only

## Minimum success standard

An action is complete only when:

- the action node is persisted
- the target object is explicit
- record context is explainable when the action depends on it
- risky flows such as through edits or nested popups distinguish "persisted" from "smoke tested"

If the button exists but nobody knows which record it targets, it is not complete.

## Common mistakes

- row edit action has no record-id source
- approve or reject only exists as a button shell
- add-child action has no parent context
- persisted action buttons are misreported as business actions that already work

## Related docs

- [../blocks/table.md](../blocks/table.md)
- [../blocks/details.md](../blocks/details.md)
- [../blocks/edit-form.md](../blocks/edit-form.md)
- [popup-openview.md](popup-openview.md)
- [relation-context.md](relation-context.md)
- [tree-table.md](tree-table.md)
