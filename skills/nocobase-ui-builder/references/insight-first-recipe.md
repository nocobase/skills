---
title: insight-first recipe
description: Candidate generation recipe for overview, dashboard, trend, KPI, and explanatory pages. Bias toward insight surfaces first; guard still owns legality.
---

# insight-first recipe

This recipe shifts the planner from "protect table/details first" to "express the insight intent first".

Typical triggers:

- `overview`
- `trend`
- `distribution`
- `analytics`
- `share`
- `dashboard`
- `KPI`
- `interactive guide`
- `narrative analysis`

## Scope

This recipe does two things:

1. generate a better candidate pool
2. apply a semantic ranking bias that matches the request better

It does not:

1. lock the page into a single layout
2. move guard logic into planner ranking
3. require every candidate to include `TableBlockModel` or `DetailsBlockModel`

## Hard contract vs soft recipe

### Hard contract

The hard contract only answers whether the payload is legal to persist:

- whether `ChartBlockModel` has complete query and option modes
- whether `GridCardBlockModel` has a complete `item + grid` subtree
- whether `JSBlockModel` or RunJS trips known blockers
- whether collection, field, and relation metadata meet pre-write requirements

Those rules belong to:

- [patterns/payload-guard.md](patterns/payload-guard.md)
- `scripts/flow_payload_guard.mjs`
- `scripts/spec_contracts.mjs`

### Soft recipe

The soft recipe only decides what to generate and rank first:

- trend and analytics requests should prefer `ChartBlockModel`
- KPI and numeric summary requests should prefer `GridCardBlockModel`
- interactive or narrative requests should let `JSBlockModel` stand next to chart or grid-card surfaces
- if `filter + insight surface` already expresses the goal, table and details are optional

## Primary block priority

### chart-first

Keywords:

- `trend`
- `distribution`
- `share`
- `chart`
- `report`
- `dashboard`

Default primary block:

- `ChartBlockModel`

Default companions:

- `FilterFormBlockModel`
- `JSBlockModel`

### grid-card-first

Keywords:

- `KPI`
- `metric card`
- `summary`
- `overview`

Default primary block:

- `GridCardBlockModel`

Default companions:

- `FilterFormBlockModel`
- `JSBlockModel`
- `ChartBlockModel`

### js-peer-first

Keywords:

- `interactive`
- `linked`
- `guide`
- `narrative`
- `custom`

Default policy:

- `JSBlockModel` is not the skeleton itself
- but it may still be the main expression surface inside `insight` or `extension`
- it usually pairs with `ChartBlockModel` or `GridCardBlockModel`, not alone

## Candidate layouts

Generate at least:

1. `keyword-anchor`
2. `content-control`
3. `collection-workbench`
4. `analytics-mix`
5. `tabbed-multi-surface`

## Ranking rules

Prioritize:

1. whether the candidate matches an explicit insight anchor
2. whether it forms a strong `chart-js`, `grid-js`, or `chart-grid-js` combination
3. whether it expresses the goal without unnecessary conservative blocks

Do not prioritize:

1. whether it already includes `TableBlockModel`
2. whether it already includes `DetailsBlockModel`
3. whether it looks like a traditional workbench

## Valid no-table/no-details outcomes

All of the following are valid when they match the request:

- `FilterFormBlockModel + ChartBlockModel`
- `FilterFormBlockModel + ChartBlockModel + JSBlockModel`
- `FilterFormBlockModel + GridCardBlockModel + JSBlockModel`
- `ChartBlockModel + JSBlockModel`
- `GridCardBlockModel + JSBlockModel`

## Fallback timing

Fallback is allowed only when:

1. pre-write guard proves that a candidate misses a required contract
2. compile has already proved that the candidate cannot persist safely

Do not fall back early in the planner just because `Filter + Table` feels safer.

## Recommended output fields

Keep at least:

- `creativeIntent`
- `selectedInsightStrategy`
- `jsExpansionHints`
- `visualizationSpec`

## Continue reading

- [page-first-planning.md](page-first-planning.md)
- [flow-model-recipes.md](flow-model-recipes.md)
- [blocks/chart.md](blocks/chart.md)
- [blocks/grid-card.md](blocks/grid-card.md)
- [js-models/index.md](js-models/index.md)
