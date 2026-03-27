# Flow model recipe compatibility entrypoint

This file remains as a legacy entrypoint, but it no longer maintains the old monolithic recipe table. The canonical router is now:

- [index.md](index.md)

If you reached this file from an old prompt, note, or test, continue through the matching path below.

## Page lifecycle

- [recipes/page-lifecycle.md](recipes/page-lifecycle.md)
- [ui-api-overview.md](ui-api-overview.md)
- [opaque-uid.md](opaque-uid.md)

Use for:

- `createV2` and `destroyV2`
- page shell, hidden default tab, and page or grid anchors
- route-ready, readback, and page-level delivery

## Block create, update, move, and delete

- [recipes/block-mutations.md](recipes/block-mutations.md)
- [page-first-planning.md](page-first-planning.md)
- [patterns/payload-guard.md](patterns/payload-guard.md)

Use for:

- `save`, `mutate`, `ensure`, `move`, and `destroy`
- local patching on an existing page
- live snapshot before write, readback after write, and target-signature reconciliation

## Forms and actions

- [recipes/forms-and-actions.md](recipes/forms-and-actions.md)
- [patterns/index.md](patterns/index.md)
- [blocks/create-form.md](blocks/create-form.md)
- [blocks/edit-form.md](blocks/edit-form.md)
- [blocks/filter-form.md](blocks/filter-form.md)
- [blocks/details.md](blocks/details.md)

Use for:

- filter, create, edit, details, and action flows
- popup, openView, record actions, and relation context
- selector, `filterByTk`, and `dataScope.filter`

## Insight, dashboard, trend, KPI, or explanatory pages

- [insight-first-recipe.md](insight-first-recipe.md)
- [blocks/chart.md](blocks/chart.md)
- [blocks/grid-card.md](blocks/grid-card.md)
- [js-models/index.md](js-models/index.md)

## Validation, review, and improve

Only enter when the user explicitly asks:

- [validation.md](validation.md)
- [ops-and-review.md](ops-and-review.md)

## Fixed rules

1. Run `start-run` before any discovery or write action.
2. Draft payloads must not go straight to persistence. They must pass [patterns/payload-guard.md](patterns/payload-guard.md) first.
3. `createV2` only means the page shell exists. Route-ready, readback, and runtime conclusions must still be reported separately.
