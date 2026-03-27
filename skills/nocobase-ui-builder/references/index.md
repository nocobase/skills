---
title: nocobase-ui-builder reference index
description: Canonical task router for nocobase-ui-builder. Classify the task first, then read the matching canonical docs, recipes, block docs, pattern docs, and JS docs.
---

# nocobase-ui-builder reference index

Classify the task first, then open the matching docs. Do not invent payload structure from the top-level `SKILL.md`.

## Core entrypoints

- [ui-api-overview.md](ui-api-overview.md)
  API lifecycle, schema-first discovery, route-ready, readback, and tool selection
- [page-first-planning.md](page-first-planning.md)
  Page skeletons, section planning, and block mapping order
- [flow-schemas/index.md](flow-schemas/index.md)
  Local graph entrypoint for model, slot, and artifact lookup
- [patterns/payload-guard.md](patterns/payload-guard.md)
  Pre-write guard, blocker and warning rules, and risk accept rules
- [opaque-uid.md](opaque-uid.md)
  Page and node uid generation rules

## Task routing

- Create or destroy a page:
  [recipes/page-lifecycle.md](recipes/page-lifecycle.md),
  [ui-api-overview.md](ui-api-overview.md),
  [opaque-uid.md](opaque-uid.md)
- Read, update, move, or destroy an existing block:
  [recipes/block-mutations.md](recipes/block-mutations.md),
  [page-first-planning.md](page-first-planning.md),
  [ui-api-overview.md](ui-api-overview.md)
- Forms, actions, popup/openView, and record actions:
  [recipes/forms-and-actions.md](recipes/forms-and-actions.md),
  [patterns/index.md](patterns/index.md)
- Insight, dashboard, trend, KPI, and explanatory pages:
  [insight-first-recipe.md](insight-first-recipe.md),
  [blocks/chart.md](blocks/chart.md),
  [blocks/grid-card.md](blocks/grid-card.md),
  [js-models/index.md](js-models/index.md)
- Validation, review, improve, or smoke:
  [validation.md](validation.md),
  [ops-and-review.md](ops-and-review.md)

## Compatibility entrypoints

- [flow-model-recipes.md](flow-model-recipes.md)
  Legacy entrypoint that now redirects to recipes and canonical docs
- [validation-scenarios.md](validation-scenarios.md)
  Dynamic scenario planning details for validation
- [validation-data-preconditions.md](validation-data-preconditions.md)
  Legacy entrypoint. Data-preparation rules now live in `validation.md`

## Block docs

- [blocks/index.md](blocks/index.md)
- [blocks/public-blocks-inventory.md](blocks/public-blocks-inventory.md)
- [blocks/page-and-tabs.md](blocks/page-and-tabs.md)
- [blocks/filter-form.md](blocks/filter-form.md)
- [blocks/table.md](blocks/table.md)
- [blocks/details.md](blocks/details.md)
- [blocks/create-form.md](blocks/create-form.md)
- [blocks/edit-form.md](blocks/edit-form.md)
- [blocks/chart.md](blocks/chart.md)
- [blocks/grid-card.md](blocks/grid-card.md)

## Cross-cutting patterns

- [patterns/index.md](patterns/index.md)
- [patterns/payload-guard.md](patterns/payload-guard.md)
- [patterns/clickable-relation-column.md](patterns/clickable-relation-column.md)
- [patterns/popup-openview.md](patterns/popup-openview.md)
- [patterns/relation-context.md](patterns/relation-context.md)
- [patterns/table-column-rendering.md](patterns/table-column-rendering.md)
- [patterns/record-actions.md](patterns/record-actions.md)
- [patterns/tree-table.md](patterns/tree-table.md)
- [patterns/many-to-many-and-through.md](patterns/many-to-many-and-through.md)

## JS / RunJS docs

- [js-models/index.md](js-models/index.md)
- [js-models/rendering-contract.md](js-models/rendering-contract.md)
- [js-models/runjs-overview.md](js-models/runjs-overview.md)
- [js-models/js-block.md](js-models/js-block.md)
- [js-models/js-column.md](js-models/js-column.md)
- [js-models/js-field.md](js-models/js-field.md)
- [js-models/js-editable-field.md](js-models/js-editable-field.md)
- [js-models/js-item.md](js-models/js-item.md)
- [js-models/js-action.md](js-models/js-action.md)

## Operating rules

1. Read [ops-and-review.md](ops-and-review.md) and run `start-run` before any discovery or write action.
2. Prefer the local graph first, then call `PostFlowmodels_schemabundle` or `PostFlowmodels_schemas` only when needed.
3. The default write path is: call MCP first, then feed artifacts into `node scripts/ui_write_wrapper.mjs run --action <create-v2|save|mutate|ensure> ...`. Do not call the low-level write interfaces directly and do not let the wrapper call NocoBase itself.
4. Every write must pass [patterns/payload-guard.md](patterns/payload-guard.md) first.
5. Validation, review, and improve conclusions always come from [validation.md](validation.md) plus [ops-and-review.md](ops-and-review.md).
