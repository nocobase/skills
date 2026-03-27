# Page-first planning

## Core principle

Plan the page skeleton first, then choose blocks. Do not start from individual blocks.

## Recommended skeletons

- `focus-stack`
- `split-workbench`
- `multi-section-workbench`
- `tabbed-workbench`

## Standard sections

- `controls`
- `primary`
- `secondary`
- `insight`
- `extension`

## Block mapping order

1. Define section responsibilities and data boundaries first
2. Choose implementation blocks second
3. `ChartBlockModel`, `GridCardBlockModel`, and `JSBlockModel` are first-class blocks inside `insight`
4. `JSBlockModel` is not the page skeleton itself, but it can still be the main expression surface inside `insight` or `extension`

Default section mapping:

- `controls` -> `FilterFormBlockModel`
- `primary` -> `TableBlockModel`, `DetailsBlockModel`, `CreateFormModel`, `EditFormModel`
- `secondary` -> `TableBlockModel`, `DetailsBlockModel`
- `insight` -> `ChartBlockModel`, `GridCardBlockModel`, `ListBlockModel`, `MapBlockModel`
- `extension` -> `MarkdownBlockModel`, `JSBlockModel`

Heuristics:

- requests like `overview`, `trend`, `distribution`, `analytics`, `share`, or `dashboard` should prefer `ChartBlockModel`
- requests like `metric card`, `KPI`, `summary`, or `overview` that are primarily numeric should prefer `GridCardBlockModel`
- requests like `interactive`, `linked`, `guide`, `narrative`, or `custom` may put `JSBlockModel` next to chart or grid-card surfaces instead of falling back to `Table/Details`

## Execution requirements

1. The planner should emit a `pagePlan` first
2. The build stage should implement sections through `pagePlan.sections[]` and `pagePlan.tabs[]`
3. Review should first validate whether section responsibilities make sense, then validate block selection
4. If a page feels weak, question the skeleton first before blaming an individual block
