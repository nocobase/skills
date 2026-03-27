---
title: TableBlockModel
description: Minimum stable tree, done criteria, and related pattern entrypoints for primary tables, relation tables, tree tables, and action columns.
---

# TableBlockModel

## Applies to

- `TableBlockModel`
- `TableColumnModel`
- `TableActionsColumnModel`

Typical targets:

- primary collection list pages
- relation tables inside details, drawers, or popups
- pages with multiple tables
- tree tables
- many-to-many or through relation tables

## When to use it

- the user wants to display a set of records
- the user wants table-level or row-level actions
- the user wants a one-to-many, many-to-many, or through table inside details or popup flows

## Pre-write checklist

1. Read schema for `TableBlockModel` and `TableColumnModel`
2. Confirm field metadata for the target collection
3. Confirm the current live grid or popup subtree
4. If the user asks for visible values, read [../patterns/table-column-rendering.md](../patterns/table-column-rendering.md)
5. If popup, drawer, or dialog actions exist, read [../patterns/popup-openview.md](../patterns/popup-openview.md)
6. If this is a relation table, read [../patterns/relation-context.md](../patterns/relation-context.md)
7. If this is a tree table, read [../patterns/tree-table.md](../patterns/tree-table.md)
8. If this is a many-to-many or through flow, read [../patterns/many-to-many-and-through.md](../patterns/many-to-many-and-through.md)

## Minimal success tree

By scenario:

- shell-only:
  - `TableBlockModel`
  - `resourceSettings`
  - basic `tableSettings`
- real visible data table:
  - `TableBlockModel`
  - at least one `TableColumnModel`
  - every target column follows [../patterns/table-column-rendering.md](../patterns/table-column-rendering.md), includes `subModels.field`, and persists column width
- action-enabled table:
  - add `TableActionsColumnModel`
  - persist a real action tree inside the action column

## Done criteria

- the table binds an explicit `collectionName`
- every requested key column exists
- if the user asked for real visible values, every key column has a field-rendering subtree
- if the user asked for real visible values, every key column also persists a renderable width
- if the user asked for table or row actions, the action column or block actions are persisted
- if the user explicitly asked for record-level popup actions, the row actions inside `TableActionsColumnModel` also count toward acceptance
- for relation tables, the filter context is explicit and the report can name which sample data it should hit

## Common traps

- `TableColumnModel` exists without `subModels.field`, so the column shell renders but values do not
- `TableColumnModel` misses `tableColumnSettings.width.width`, so the field still shows up in `Fields` but the column itself does not render
- popup actions are added first while the main visible columns stay incomplete
- relation dotted paths such as `customer.name` omit `associationPathName`
- relation display bindings are split into `target collection + associationPathName + simple fieldPath`
- relation tables hardcode `f_*` or physical foreign keys before checking metadata
- "table block persisted" is misreported as "table works"

## Related patterns

- [../patterns/table-column-rendering.md](../patterns/table-column-rendering.md)
- [../patterns/popup-openview.md](../patterns/popup-openview.md)
- [../patterns/relation-context.md](../patterns/relation-context.md)
- [../patterns/tree-table.md](../patterns/tree-table.md)
- [../patterns/many-to-many-and-through.md](../patterns/many-to-many-and-through.md)

## Fallback policy

- prioritize real visible data on the main table before adding complex popups or form shells
- if the column rendering model is still ambiguous, report the result as a shell or reduce the scope to stable columns
- for complex relation tables, state the filter context and sample-hit coverage clearly before extending the action tree
