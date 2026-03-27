# ChartBlockModel

## When to prefer it

Use `ChartBlockModel` for:

- overview and dashboard requests
- trend and distribution views
- analytics and reporting surfaces
- share or pie-style views

## Real configuration paths

Usable chart configuration lives here:

- `stepParams.chartSettings.configure.query`
- `stepParams.chartSettings.configure.chart.option`
- `stepParams.chartSettings.configure.chart.events.raw`

Collection binding lives at:

- `stepParams.resourceSettings.init.collectionName`

Do not treat a chart like a normal list block that only needs `resourceSettings`.

## Minimal stable recipe

At minimum:

- `query.mode='builder'`
- `chart.option.mode='basic'`
- `query.collectionPath=['<dataSourceKey>', '<collectionName>']`
- at least one `query.measures` entry
- non-empty `chart.option.builder`

## Query modes

### `builder`

Required fields:

- `chartSettings.configure.query.mode='builder'`
- `chartSettings.configure.query.collectionPath=['<dataSourceKey>', '<collectionName>']`
- `chartSettings.configure.query.measures=[...]`
- `chartSettings.configure.query.dimensions=[...]` when the chart needs them

Field contract:

- scalar fields stay strings such as `"amount"` or `"status"`
- relation fields must use array paths such as `["customer", "name"]`
- do not use dotted relation strings like `"customer.name"` in chart queries
- `query.orders[].field` follows the same rule
- builder aliases inside `chart.option.builder` still use final string names such as `xField`, `yField`, `pieCategory`, or `pieValue`

### `sql`

Required fields:

- `chartSettings.configure.query.mode='sql'`
- `chartSettings.configure.query.sqlDatasource`
- `chartSettings.configure.query.sql`

## Option modes

### `basic`

Requires:

- `chartSettings.configure.chart.option.builder`

### `custom`

Requires:

- `chartSettings.configure.chart.option.mode='custom'`
- `chartSettings.configure.chart.option.raw`

Optional:

- `chartSettings.configure.chart.events.raw`

## Default skill policy

1. Overview, trend, distribution, analytics, share, and dashboard requests should treat `ChartBlockModel` as the first `insight` candidate.
2. If the request also asks for interaction, linking, guide, narrative, or custom behavior, `ChartBlockModel + JSBlockModel` may be the main expression pair.
3. Prefer `builder + basic` first.
4. Only generate `sql` or `custom` when the user explicitly asks for them.
5. If the current collection or query configuration is still unstable, expose the gap through guard or compile artifacts rather than silently downgrading too early.

## Guard focus

Important guard codes include:

- `CHART_QUERY_MODE_MISSING`
- `CHART_OPTION_MODE_MISSING`
- `CHART_BUILDER_COLLECTION_PATH_MISSING`
- `CHART_COLLECTION_PATH_SHAPE_INVALID`
- `CHART_BUILDER_MEASURES_MISSING`
- `CHART_BASIC_OPTION_BUILDER_MISSING`
- `CHART_SQL_DATASOURCE_MISSING`
- `CHART_SQL_TEXT_MISSING`
- `CHART_CUSTOM_OPTION_RAW_MISSING`

Canonicalization may still:

- default `query.mode` to `builder`
- default `option.mode` to `basic`
- normalize a single-element chart field array into a scalar string
- rewrite a legacy dotted relation path into an array path when metadata proves the relation path is stable

## Continue reading

- [../page-first-planning.md](../page-first-planning.md)
- [grid-card.md](grid-card.md)
- [public-blocks-inventory.md](public-blocks-inventory.md)
