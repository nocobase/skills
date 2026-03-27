---
title: UI cross-cutting pattern index
description: Read nocobase-ui-builder pattern docs by symptom or complex cross-block behavior.
---

# UI cross-cutting pattern index

## How to use this index

Use this index when the task is not just "how to build one block", but involves a cross-block detail such as:

- why table columns do not show real values
- why a relation title column is unstable when clicked
- how popup or openView context should be passed
- why a relation table is empty
- how record actions receive the current record
- how tree tables, self-relations, many-to-many, or through fields should work
- how JS models should render

If pattern docs are still not enough, go back to the schema-first flow in [../ui-api-overview.md](../ui-api-overview.md) and continue runtime discovery.

If the target `use` is already known, read [../flow-schemas/index.md](../flow-schemas/index.md) and the corresponding `models/<UseName>.json` first. Only open catalogs or artifacts when slot or schema details still matter.

## Pattern directory

| Pattern | Doc | Solves | Typical blocks |
| --- | --- | --- | --- |
| Payload guard | [payload-guard.md](payload-guard.md) | pre-write guard, risk accept, filter/path/foreign-key safety | all flow-model writes |
| JS rendering contract | [../js-models/rendering-contract.md](../js-models/rendering-contract.md) | `ctx.render()` vs `innerHTML` or `return value` | JS model family |
| Table column rendering | [table-column-rendering.md](table-column-rendering.md) | column shell without real values, display-model mapping, relation paths | `TableBlockModel` |
| Clickable relation column | [clickable-relation-column.md](clickable-relation-column.md) | relation title display plus popup-open behavior | `TableBlockModel` |
| Popup / openView | [popup-openview.md](popup-openview.md) | drawer, dialog, ChildPage, nested popup, `filterByTk`, input args | form, table, details actions |
| Relation context | [relation-context.md](relation-context.md) | relation tables, popup relation blocks, foreign-key filters, through relations | table, details, filter form |
| Record actions | [record-actions.md](record-actions.md) | view, edit, approve, add child, and row-action trees | table, details, edit form |
| Tree table | [tree-table.md](tree-table.md) | `treeTable`, self-relations, hierarchical actions | `TableBlockModel` |
| Many-to-many and through | [many-to-many-and-through.md](many-to-many-and-through.md) | member tables, through fields, relation editing | table, edit form |

## Relation to block docs

- locate the main block doc first: [../blocks/index.md](../blocks/index.md)
- then open the matching pattern doc for the detail that is actually blocking the task
- pattern docs do not replace block docs; they only capture cross-block reusable rules
- JS and RunJS issues should always route back to [../js-models/index.md](../js-models/index.md)
