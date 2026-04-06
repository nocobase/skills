# Chart block

Read [chart.md](./chart.md) first for chart tasks. Read this file only after you are already inside the chart topic and need to handle runtime setup, reconfiguration, readback, or legacy fallback. The goal is not to expose every frontend-internal detail, but to generate charts that reliably render with the smallest necessary parameter set, while leaving a small number of escape hatches for complex scenarios.

If you need to verify complex contracts, negative cases, or regression matrices, continue with [chart-validation.md](./chart-validation.md). This file only keeps the runtime main path.

## Contents

1. Public DSL
2. Default strategy
3. Recommended execution order
4. Outer block parameters (minimum exposed set)
5. Minimum viable recipe
6. Query rules
7. Visual rules
8. Events rules
9. How to use `flowSurfaces:context`
10. JS context notes
11. Readback
12. Boundary reminders
13. Current skill limitations
14. When to fall back to legacy `configure`

## Public DSL

For chart, `flowSurfaces.configure(...).changes` / `compose(...).blocks[].settings` should default to these three semantic groups:

```json
{
  "query": { "...": "..." },
  "visual": { "...": "..." },
  "events": { "...": "..." }
}
```

`configure` is still kept as a legacy fallback, but do not mix `configure` with `query / visual / events`. The server normalizes legacy `configure` through the same chart contract. For example, builder query is normalized to `query.collectionPath`, rather than keeping `query.resource`.

Other than that, the chart block should only expose four additional outer-block parameters for this skill. Detailed rules are covered in the later section "Outer block parameters (minimum exposed set)".

The priority is to stabilize both "card displays" and "chart renders". Do not expose frontend-internal details such as `props / decoratorProps / stepParams` to the user.

Chart is also an example of the general public-settings pattern: when creating or reconfiguring, prefer public semantics such as `query / visual / events / title / displayTitle / height / heightMode`. Do not reverse internal `props / decoratorProps / stepParams` from readback into the next input template.

## Default Strategy

1. Default to `query.mode = "builder"` first.
2. Default to `visual.mode = "basic"` first.
3. When reconfiguring an existing chart, default to the `safeDefaults` returned by `flowSurfaces:context(path="chart")`. When creating a new chart, create the block first, write `query` first, and only then read `path="chart"`.
4. If you hit `riskyPatterns`, do not forbid the path outright. You may continue, but you must mark the result as risky and add `readback`.
5. If you hit `unsupportedPatterns`, do not invent a payload. Rewrite it into a safe subset or tell the user clearly that the current contract does not support it.
6. Only upgrade under the following conditions:
   - the query truly must use SQL -> `query.mode = "sql"`
   - the basic chart type and mappings are insufficient -> `visual.mode = "custom"`
   - click / zoom / interactions are needed -> `events.raw`

## Recommended Execution Order

The most stable execution order for a chart block is not a one-shot blind write. It is:

1. `addBlock(type="chart", settings={ title?, displayTitle?, height?, heightMode? })`
2. If you are configuring a builder query, read `flowSurfaces:context(path="collection")` first to pick fields
3. Run `configure(changes={ query, title?, displayTitle?, height?, heightMode? })` first
4. Then read `flowSurfaces:context(path="chart")`
5. Based on `chart.queryOutputs / aliases / supportedMappings / supportedStyles / safeDefaults / riskyPatterns / unsupportedPatterns`, run `configure(changes={ visual, events? })`
6. Use `get(uid)` for canonical readback
7. If a risky pattern is hit, state clearly in the result that this is a risky path, and confirm persistence through readback

When reconfiguring an existing chart, you may skip the initial block-creation step and continue directly from "read `path="chart"` / clear stale query state / reconfigure visual". If you want to clear old builder state, especially residue such as `sorting` / `filter`, do not rely on omission and hope the server clears it. Pass explicit empties instead, for example:

- `sorting: []`
- `filter: { "logic": "$and", "items": [] }`

This prevents old query residue from contaminating the new configuration and affecting runtime behavior later.

Only use `changes.configure` when you are explicitly preserving compatibility with old configuration. Once you use `configure`:

- do not also pass `query / visual / events`
- the `configure` payload must be a complete and valid chart config; do not expect the server to accept a partial or broken one

## Outer Block Parameters (Minimum Exposed Set)

In addition to `query / visual / events / configure`, the chart block should expose only these four outer parameters to this skill:

- `title?: string`
- `displayTitle?: boolean`
- `height?: number`
- `heightMode?: "defaultHeight" | "specifyValue" | "fullHeight"`

Notes:

- Public docs should only advertise the true frontend enum values for `heightMode`:
  - `defaultHeight`
  - `specifyValue`
  - `fullHeight`
- For compatibility with old skills / historical payloads, the server still accepts `fixed` and automatically normalizes it to `specifyValue`
- `title` only accepts a non-empty string; `displayTitle` only accepts `true | false`
- `height` only accepts numbers; it is typically paired with `heightMode = "specifyValue"`
- If `heightMode = "specifyValue"`, it is recommended to also pass `height`
- If `heightMode = "defaultHeight" | "fullHeight"`, you usually should not pass `height`
- The primary success criterion in the current public contract is `stepParams.cardSettings`, for example `titleDescription` / `blockHeight`
- `decoratorProps` may appear as a legacy / UI-layer mirror, but it is not a required success criterion for chart persistence
- Skill docs and readback should no longer require "must see decoratorProps to count as success"; whether chart runtime truly takes effect should be judged by `cardSettings`

Invalid:

- documenting `heightMode = "fixed"` as the primary public syntax
- passing arbitrary unknown strings into `heightMode`

Additional note:

- The current server strictly validates the enum values of `heightMode`, but it will not reject `heightMode = "specifyValue"` just because `height` is missing
- The skill should still treat "`specifyValue` paired with `height`" as the recommended pattern, because it yields the most stable frontend behavior

## Minimum Viable Recipe

The safest minimum chart recipe is:

```json
{
  "query": {
    "mode": "builder",
    "resource": {
      "dataSourceKey": "main",
      "collectionName": "employees"
    },
    "measures": [
      {
        "field": "id",
        "aggregation": "count",
        "alias": "employeeCount"
      }
    ],
    "dimensions": [
      {
        "field": "department.title"
      }
    ]
  },
  "visual": {
    "mode": "basic",
    "type": "bar",
    "mappings": {
      "x": "department.title",
      "y": "employeeCount"
    }
  }
}
```

When choosing default values, the skill should prefer this safe subset:

- builder query
- single measure
- basic visual
- explicit mappings
- no sorting generated in the first round

## Query Rules

### builder

Valid:

- `mode = "builder"`
- `resource.collectionName` is required; when `dataSourceKey` is omitted, default to `main`
- The skill should only write public `resource`; the backend canonicalizes it into internal `query.collectionPath`
- `measures` must be a non-empty array
- `measures[].field` is required
- `aggregation` only supports `sum | count | avg | max | min`
- `dimensions` is optional
- `filter` is optional and should be a FilterGroup structure
- `sorting` is optional; to maximize first-try success, the skill should not proactively generate sorting unless the user explicitly asks for it
- If existing sorting needs to be cleared, pass `sorting: []` explicitly. Do not rely on omission
- Builder sorting should currently be treated as an advanced path only
- The current runtime / FlowSurfaces contract rejects:
  - sorting on aggregate measure outputs
  - sorting on custom measure aliases
- Therefore, the skill should not generate those forms of sorting by default. Treat them as `unsupportedPatterns.builder_measure_sorting`
- `context(path="chart").chart.aliases` is only safe for `visual.mappings.*`
- Do not assume that an alias appearing in `chart.aliases` can also be used in `query.sorting.field`
- `limit` must be an integer greater than or equal to 0; `offset` must also be an integer greater than or equal to 0
- In the public DSL, always write `sorting[].direction = "asc" | "desc"`
- Do not write internal persisted shape `query.orders[].order` yourself; backend compatibility logic handles that conversion

Invalid:

- missing `resource`
- writing both `resource` and `collectionPath`
- empty `measures`
- empty-string `field`
- aggregate sorting that references an unselected field
- aggregate sorting that still uses the original field name after introducing a custom alias, for example `sum(amount) as totalAmount` while still writing `sorting.field = "amount"`
- empty-string `filter.items[].path`
- `visual.mappings.*` referencing a field / alias that query does not output

### sql

Valid:

- `mode = "sql"`
- `sql` is required
- `sqlDatasource` is optional
- SQL is additionally persisted into `flowSql`; whether it was truly saved cannot be judged from stepParams alone
- SQL should only be a single read-only `SELECT` / `WITH`
- After `configure(query)`, immediately prefer reading `flowSurfaces:context(path="chart")`
- If SQL has no runtime template variables, `chart.queryOutputs` now prefers to infer outputs from SQL preview metadata, and will try to return output columns even when the current dataset is empty
- If SQL contains template variables / `ctx` / liquid binds, preview may fail to infer outputs early, and the path falls into `riskyPatterns`
- If `chart.queryOutputs` is missing, FlowSurfaces now rejects writes of `visual.mode = "basic"`. The skill can only write `query` first, then close the loop through `context(path="chart") + readback`
- SQL aliases must follow `chart.queryOutputs`; do not assume that the alias casing written in SQL will be preserved exactly
- Dialects such as PostgreSQL fold unquoted aliases to lowercase. If you need a case-sensitive alias such as `employeeCount`, write `AS \"employeeCount\"`; otherwise prefer all-lowercase aliases

Invalid:

- also passing `resource / measures / dimensions / filter / sorting / limit / offset`
- empty SQL, multi-statement SQL, or obviously write-side SQL
- SQL with no output columns after preview
- SQL preview with no output columns at all

## Visual Rules

### basic

`type` only supports:

- `line`
- `area`
- `bar`
- `barHorizontal`
- `pie`
- `doughnut`
- `funnel`
- `scatter`

`mappings` only exposes:

- `x`
- `y`
- `category`
- `value`
- `series`
- `size`

### Relationship between `type` and `mappings`

| type | Required mappings | Optional mappings |
| --- | --- | --- |
| `line` / `area` / `bar` / `barHorizontal` | `x`, `y` | `series` |
| `scatter` | `x`, `y` | `series`, `size` |
| `pie` / `doughnut` / `funnel` | `category`, `value` | none |

`visual.mappings.*` should prefer, in order:

1. `chart.queryOutputs` returned by `flowSurfaces:context(path="chart")`
2. aliases explicitly declared in builder query
3. if a dimension has no alias, its field-path output directly, for example `department.title`

`style` only exposes frequent parameters:

- general: `legend`, `tooltip`, `label`
- Cartesian: `boundaryGap`, `xAxisLabelRotate`, `yAxisSplitLine`
- line / area: `smooth`
- bar / horizontal bar / area: `stack`
- pie / doughnut: `radiusInner`, `radiusOuter`, `labelType`
- funnel: `sort`, `minSize`, `maxSize`

Prefer reading `chart.supportedStyles` from `context(path="chart")` instead of hardcoding style validity inside the skill. The current server already returns, for each `visual.type`:

- allowed style keys
- the value type of each key
- optional enum values, such as `labelType` and `sort`
- numeric ranges, such as `xAxisLabelRotate`, `radiusInner/radiusOuter`, and `minSize/maxSize`

The skill should treat `supportedStyles` as the first source of truth for visual styles. The docs are only explanatory supplements.

Invalid:

- passing `raw` under `basic` mode
- passing unsupported `style` keys for the current `type`
- `radiusOuter < radiusInner`
- `maxSize < minSize`

### custom

Valid:

- `mode = "custom"`
- `raw` is required, and the code must `return` an ECharts option object

Invalid:

- also passing `type / mappings / style` under `custom` mode

## Events Rules

Valid:

- only `events.raw` is exposed
- `raw` is JS code
- the `chart` instance is accessible

Typical uses:

- click / dblclick
- dataZoom
- open popup / openView
- lightweight interactions

## How to use `flowSurfaces:context`

For chart, `context` should now be read by scenario rather than reading the same data set up front in all cases:

```json
{
  "target": { "uid": "<chart-uid>" },
  "path": "chart",
  "maxDepth": 4
}
```

```json
{
  "target": { "uid": "<chart-uid>" },
  "path": "collection",
  "maxDepth": 3
}
```

Key points:

- When creating a new chart, `path = "chart"` is only worth reading after the chart block already exists and at least one `query` has already been written. Otherwise, stable `queryOutputs` / `supportedMappings` are often unavailable
- When reconfiguring an existing chart, you may read `path = "chart"` first and then narrow the reconfiguration from current `queryOutputs / safeDefaults / riskyPatterns`
- `path = "chart"` returns:
  - `chart.queryOutputs`
  - `chart.aliases`
  - `chart.supportedMappings`
  - `chart.supportedVisualTypes`
  - `chart.safeDefaults`
  - `chart.riskyPatterns`
  - `chart.unsupportedPatterns`
- `chart.aliases` should only be understood as explicitly declared alias names. If a dimension has no alias, prefer taking the usable output name from `chart.queryOutputs`
- builder chart exposes `collection`
- It can be used to narrow:
  - fields inside `query.filter`
  - fields referenced by `query.dimensions / measures / sorting`
  - collection fields safely accessible inside `visual.raw` / `events.raw`
- `visual.mappings.*` should not be guessed directly from `collection`; prefer `chart.queryOutputs` / `chart.aliases`
- SQL chart does not expose `collection`
- SQL chart still exposes `chart.supportedMappings` / `chart.supportedVisualTypes`
- If SQL chart does not provide `queryOutputs`, first inspect whether `riskyPatterns` indicates runtime context / preview unavailable. Do not blindly write `visual.mappings` without an output-column basis
- Builder charts may be used as filter-form targets
- SQL charts cannot be used directly as filter-form targets. If a binding already exists, it should be treated as invalid after switching to SQL and confirmed through readback

## JS Context Notes

Two different context types must be distinguished here:

1. **FlowSurfaces stable context**
   - fields stably exposed to the skill by `flowSurfaces:context`
   - for chart, the currently stable fields are:
     - `collection`
     - `chart.queryOutputs`
     - `chart.aliases`
     - `chart.supportedMappings`
     - `chart.supportedVisualTypes`
     - `chart.safeDefaults`
     - `chart.riskyPatterns`
     - `chart.unsupportedPatterns`
2. **frontend runtime assumptions**
   - variables typically available at runtime to `ChartBlockModel` / `ChartOptionModel` / `ChartEventsModel`
   - they are appropriate for writing `visual.raw` / `events.raw`
   - do not mistake them for fields that `flowSurfaces:context` is guaranteed to return

### `visual.raw`

Any `visual.raw` write must first pass the validator gate described in [js.md](./js.md), using `ChartOptionModel`. For CLI and network constraints, see [runjs-runtime.md](./runjs-runtime.md).

At frontend runtime, you should assume these are available first:

- `ctx.data.objects`
- `ctx.collection`
- `ctx.record`
- `ctx.popup.record`

Rules:

- directly `return` the ECharts option object
- `ctx.render(...)` is not required
- treat `ctx.data` as the runtime dataset, so array items and fields may be accessed

### `events.raw`

Any `events.raw` write must first pass the validator gate described in [js.md](./js.md), using `ChartEventsModel`. For CLI and network constraints, see [runjs-runtime.md](./runjs-runtime.md).

At frontend runtime, you should assume these are available first:

- `chart`
- `ctx.openView`
- `ctx.record`
- `ctx.popup.record`

Rules:

- the `chart` instance is exposed through a top-level alias; primarily use bare `chart.on(...)` / `chart.off(...)`
- do not write `ctx.chart.on(...)` / `ctx.chart.off(...)`
- `ctx.render(...)` is not required
- runtime treats `ctx.openView(...)` as a simulated call rather than actually opening a popup

## Readback

Minimum required post-write readback:

- `tree.stepParams.cardSettings.titleDescription.title` when `displayTitle !== false` and `title` is non-empty
- `tree.stepParams.cardSettings.blockHeight.heightMode`
- `tree.stepParams.cardSettings.blockHeight.height` when `heightMode = "specifyValue"`
- if `displayTitle = false`, expect `tree.stepParams.cardSettings.titleDescription` to be absent
- `cardSettings` is the primary criterion; if `tree.decoratorProps.*` exists it is only an auxiliary mirror, and `tree.props.*` is not the primary criterion
- `tree.stepParams.chartSettings.configure.query`
- `tree.stepParams.chartSettings.configure.chart.option`
- `tree.stepParams.chartSettings.configure.chart.events`
- if the public DSL used `resource` / `sorting.direction`, readback should show the internal canonical structure:
  - `query.collectionPath`
  - `query.orders[].order`
- for SQL chart, additionally confirm that it has been stably persisted into `flowSql`
- do not judge success only from `tree.stepParams.chartSettings.configure.query.sql`

On the skill side, persistence should be confirmed against the internal readback structure, not by assuming the public DSL was persisted verbatim.

## Boundary Reminders

- Real-browser validation is not part of the default responsibility of this skill. This file only covers FlowSurfaces contract, context narrowing, and readback.

## Current Skill Limitations

- `visual.raw` / `events.raw` must not reuse ordinary `jsBlock` / `js action` models. They should use `ChartOptionModel` / `ChartEventsModel` respectively.
- These two code paths should still prefer conservative templates, and when needed, call `flowSurfaces:context` first to narrow context, then write, then read back.
- If the user only wants "a chart rendered first", always prefer `builder + basic`. Do not start with custom JS.
- If the user wants to switch the chart collection, prefer providing both of these in the same write:
  - new `query`
  - new `visual.mappings`
  This has the highest success rate
- SQL chart should default to a two-step write:
  - write `query` first
  - then read `context(path="chart")`
  - then write `visual` from `chart.queryOutputs`
- If `chart.queryOutputs` is missing and `riskyPatterns` indicates runtime context / preview unavailable, do not fabricate mappings. The server rejects basic visual in that case, so you can only keep the query unless the user explicitly chooses `visual.mode = "custom"` and accepts the risky path

## When to Fall Back to Legacy `configure`

Only fall back in the following cases:

1. compatibility with existing internal configuration is required
2. `visual.raw` / `events.raw` still cannot express the requirement
3. you explicitly know that frontend-internal structure must be written

Otherwise, prefer `query / visual / events`.
