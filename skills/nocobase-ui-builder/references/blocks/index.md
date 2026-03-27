---
title: UI block documentation index
description: Read nocobase-ui-builder block docs by block `use`, then follow the linked pattern docs when the task crosses block boundaries.
---

# UI block documentation index

## How to use this index

1. Choose the page skeleton and section layout through [../page-first-planning.md](../page-first-planning.md) before choosing blocks.
2. Identify the main block `use` for the current task.
3. Read the matching block document.
4. Follow the linked pattern docs from that block document when needed.
5. If a dedicated block doc does not exist yet, fall back to [../index.md](../index.md), [../ui-api-overview.md](../ui-api-overview.md), and [../flow-model-recipes.md](../flow-model-recipes.md), and record the gap in the run log.

Recommended first reads:

- [public-blocks-inventory.md](public-blocks-inventory.md)
- [../flow-schemas/index.md](../flow-schemas/index.md)

If the target `use` is already known, read `models/<UseName>.json` first. Only open catalogs or artifacts when slot or schema details still matter.

## JS model / RunJS

If the task involves `JSBlockModel`, `JSColumnModel`, `JSFieldModel`, `JSItemModel`, `JSActionModel`, or any `runJs` code, read:

- [../js-models/index.md](../js-models/index.md)
- [../js-models/rendering-contract.md](../js-models/rendering-contract.md)

## Main block docs

- `FilterFormBlockModel` -> [filter-form.md](filter-form.md)
- `TableBlockModel` -> [table.md](table.md)
- `DetailsBlockModel` -> [details.md](details.md)
- `CreateFormModel` -> [create-form.md](create-form.md)
- `EditFormModel` -> [edit-form.md](edit-form.md)
- `ChartBlockModel` -> [chart.md](chart.md)
- `GridCardBlockModel` -> [grid-card.md](grid-card.md)
- `PageModel` / `RootPageTabModel` / `PageTabModel` -> [page-and-tabs.md](page-and-tabs.md)
- JS model family -> [../js-models/index.md](../js-models/index.md)

## Common cross-cutting symptoms

- columns exist but show no real values -> [../patterns/table-column-rendering.md](../patterns/table-column-rendering.md)
- drawer, dialog, ChildPage, or nested popup -> [../patterns/popup-openview.md](../patterns/popup-openview.md)
- relation tables, popup relation tables, or foreign-key filtering -> [../patterns/relation-context.md](../patterns/relation-context.md)
- record-level actions such as view, edit, approve, or add child -> [../patterns/record-actions.md](../patterns/record-actions.md)
- tree tables or self-referential data -> [../patterns/tree-table.md](../patterns/tree-table.md)
- many-to-many relations or through fields -> [../patterns/many-to-many-and-through.md](../patterns/many-to-many-and-through.md)
