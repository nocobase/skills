---
title: ChartBlockModel
description: Chart 区块的 public blueprint 配置、basic visual mappings、query 规则与常见误配。
---

# ChartBlockModel

## 什么时候优先用

当用户意图是下面这些词时，默认优先把它放进 `insight` section，而不是退回纯表格：

- `总览` / `概览`
- `趋势` / `trend`
- `分布` / `distribution`
- `统计` / `analytics`
- `占比` / `pie`
- `报表` / `dashboard`
- `分析看板`（不是 kanban/pipeline/泳道 类看板）

如果请求只是几个 KPI 数字摘要，没有明显图形语义，优先看 [../js-models/js-block.md](../js-models/js-block.md) 的 JSBlock 统计面板。

如果请求带 `kanban / pipeline / 状态列 / 拖拽 / 泳道 / backlog / 看板区块` 这类明确 kanban cue，不要继续走 chart，改看 [kanban.md](kanban.md)。

## Whole-page public blueprint 写法

在 `applyBlueprint` 里，chart block 不接受 `stepParams`。首选和 canonical 写法是把图表配置放进 `assets.charts`，然后在 block 上用 `block.chart` 引用资产 key：

```json
{
  "assets": {
    "charts": {
      "statusChart": {
        "query": {
          "mode": "builder",
          "resource": { "dataSourceKey": "main", "collectionName": "orders" },
          "measures": [
            { "field": "id", "aggregation": "count", "alias": "count_orders" }
          ],
          "dimensions": [
            { "field": "status" }
          ]
        },
        "visual": {
          "mode": "basic",
          "type": "pie",
          "mappings": {
            "category": "status",
            "value": "count_orders"
          }
        }
      }
    }
  },
  "tabs": [
    {
      "blocks": [
        {
          "key": "statusChart",
          "type": "chart",
          "title": "Status distribution",
          "chart": "statusChart"
        }
      ]
    }
  ]
}
```

Whole-page `applyBlueprint` 现在不提供 inline chart 自动提升。旧草稿如果把 `settings.query` / `settings.visual` / `settings.events` 写在 chart block 上，写入前先手动迁移到 `assets.charts.<key>`，并让 block 写 `chart: "<key>"`；`settings.title`、`settings.height`、`settings.heightMode` 等 display-only 设置仍留在 block 上。

Backend authoring 的边界：

- chart block 缺少 `chart` 引用时，返回 aggregate error `chart-block-asset-reference-required`。
- `chart` 指向不存在的 asset 时，返回 `chart-block-asset-reference-missing`。
- public chart block 上写 `stepParams` 时，返回 `chart-block-step-params-unsupported`。
- 不要混写 `block.chart` 和 inline `settings.query` / `settings.visual` / `settings.events`；asset 是 whole-page 图表配置的唯一来源。

For localized `compose` / `add-block` / `configure`, put the same public groups under `settings` or `changes`:

```json
{
  "type": "chart",
  "settings": {
    "title": "Status distribution",
    "query": { "...": "..." },
    "visual": {
      "mode": "basic",
      "type": "bar",
      "mappings": { "x": "status", "y": "count_orders" }
    }
  }
}
```

## 必须避免的误配

- 不要把 `stepParams.chartSettings.configure` 写进 public blueprint block；这是 readback / internal persisted shape，不是 `applyBlueprint` 输入。
- 不要在 public `visual` 里写 `xField` / `yField` / `seriesField` / `pieCategory` / `pieValue` / `doughnutCategory` / `doughnutValue` / `funnelCategory` / `funnelValue`。这些是内部 option builder 字段，服务端可能只保留图表类型并丢失映射。
- 不要把 collection 放进 `resourceSettings.init.collectionName`；chart 查询应使用 public `query.resource`，或服务端规范化后的 `query.collectionPath`。
- 不要写 `query.resource.collection`；public blueprint 输入必须使用 canonical `query.resource.collectionName`。
- `basic` visual 必须有足够 mappings，否则图表会落成半配置状态。

## Query modes

### `builder`

优先用 builder。最小配置：

- `query.mode = "builder"`
- `query.resource = { dataSourceKey: "main", collectionName: "<collection>" }`
- `query.measures[]` 至少 1 项
- `query.dimensions[]` 按图表需要添加

在 readback 里，服务端可能把 `query.resource` 规范化为 `query.collectionPath`。这属于正常现象。

### builder field contract

- scalar 字段继续用字符串，例如 `"amount"`、`"status"`。
- builder chart query 默认优先使用宿主 collection 的 scalar 字段，例如 `"amount"`、`"status"`、`"employerGroupId"`。
- 不要直接把 association 字段本身写进 `measures[]` / `dimensions[]`，例如 `"customer"`。backend aggregate validation 会用 `chart-builder-query-association-field-requires-subfield` 拒绝，并在 `details.suggestedFieldPath` 里提示类似 `"customer.name"` 的 scalar subfield。
- 如果 relation label 分组可以用 backend 建议的 scalar subfield 表达，可以改写为该 subfield；如果需要更复杂 join、聚合或 label 逻辑，改用 SQL chart 显式 join 并设置稳定 alias。只接受显示 ID 时，才用 scalar foreign key 作为 fallback。
- `visual.mappings.*` 写 query 输出字段或 alias，例如 `"status"`、`"count_orders"`。

例子：

```json
{
  "query": {
    "mode": "builder",
    "resource": { "dataSourceKey": "main", "collectionName": "orders" },
    "measures": [
      { "field": "id", "aggregation": "count", "alias": "count_orders" }
    ],
    "dimensions": [
      { "field": "status" }
    ]
  },
  "visual": {
    "mode": "basic",
    "type": "bar",
    "mappings": {
      "x": "status",
      "y": "count_orders"
    }
  }
}
```

### `sql`

只有用户明确要求 SQL，builder 明显不够表达，或图表需要按 relation label 分组时，才切到 `sql`。`query.sql` 必须是非空 SQL 文本，且 SQL mode 不要混用 `resource` / `measures` / `dimensions` 等 builder 查询键。SQL chart 的 `visual.mappings.*` 必须跟 `context(path="chart")` 返回的 query outputs 对齐；不要凭 SQL 字符串猜字段大小写。

## Visual rules

默认用 `visual.mode = "basic"`。

Required mappings:

| type | required mappings |
| --- | --- |
| `line`, `area`, `bar`, `barHorizontal` | `x`, `y` |
| `scatter` | `x`, `y` |
| `pie`, `doughnut`, `funnel` | `category`, `value` |

可选 mappings:

- `line` / `area` / `bar` / `barHorizontal`: `series`
- `scatter`: `series`, `size`

`visual.mode = "custom"` 只在用户明确要求自定义 ECharts option 时使用；必须提供非空 `visual.raw`，且不要混用 `type` / `mappings` / `style`。

常用 visual examples:

```json
{ "mode": "basic", "type": "line", "mappings": { "x": "eventDate", "y": "count_entries" } }
```

```json
{ "mode": "basic", "type": "pie", "mappings": { "category": "status", "value": "count_entries" } }
```

## skill 默认策略

1. 命中 `总览 / 趋势 / 分布 / 统计 / 占比 / dashboard / 分析看板` 时，把 `ChartBlockModel` 视为 `insight` 区首选块。
2. 优先生成 `builder + basic + mappings`。
3. builder 图表只默认使用 scalar 字段；relation label 分组改用 SQL chart，或在用户接受 ID 时用 scalar FK fallback。
4. 用户明确说 `SQL`，或 relation label 分组无法用 scalar 字段表达时，再生成 `sql + basic` 或 `sql + custom`。
5. 用户明确要求自定义 ECharts option / events 时，才生成 `custom`。

## Dashboard chart recipes

If a dashboard asks for chart / 图表 / Charts, do not replace that section with JSBlock, table, list, gridCard, or markdown. KPI numbers can use JSBlock, but trend, distribution, ranking, and percentage / 占比 sections require `type: "chart"` blocks.

Use these whole-page recipes by replacing only collection, field, alias, title, and asset key:

```json
{
  "assets": {
    "charts": {
      "trendChart": {
        "query": {
          "mode": "builder",
          "resource": { "dataSourceKey": "main", "collectionName": "intelligenceItems" },
          "measures": [{ "field": "id", "aggregation": "count", "alias": "count_items" }],
          "dimensions": [{ "field": "occurDate" }]
        },
        "visual": { "mode": "basic", "type": "line", "mappings": { "x": "occurDate", "y": "count_items" } }
      },
      "categoryDistribution": {
        "query": {
          "mode": "builder",
          "resource": { "dataSourceKey": "main", "collectionName": "intelligenceItems" },
          "measures": [{ "field": "id", "aggregation": "count", "alias": "count_items" }],
          "dimensions": [{ "field": "intelType" }]
        },
        "visual": { "mode": "basic", "type": "doughnut", "mappings": { "category": "intelType", "value": "count_items" } }
      },
      "importanceDistribution": {
        "query": {
          "mode": "builder",
          "resource": { "dataSourceKey": "main", "collectionName": "intelligenceItems" },
          "measures": [{ "field": "id", "aggregation": "count", "alias": "count_items" }],
          "dimensions": [{ "field": "importance" }]
        },
        "visual": { "mode": "basic", "type": "bar", "mappings": { "x": "importance", "y": "count_items" } }
      }
    }
  },
  "tabs": [
    {
      "blocks": [
        { "key": "trendChart", "type": "chart", "title": "近 30 天情报新增趋势", "chart": "trendChart" },
        { "key": "categoryDistribution", "type": "chart", "title": "情报类型分布", "chart": "categoryDistribution" },
        { "key": "importanceDistribution", "type": "chart", "title": "重要程度分布", "chart": "importanceDistribution" }
      ]
    }
  ]
}
```

For a ranking chart such as "产品活跃度排行", prefer `barHorizontal`. If the ranking needs relation labels, use a SQL chart with an explicit join; do not use a relation field directly in builder dimensions.

## Backend validation 关注点

Backend aggregate `errors[]` 是写入边界。常见 rule id：

- `chart-block-asset-reference-required`
- `chart-block-asset-reference-missing`
- `chart-block-step-params-unsupported`
- `chart-query-missing`
- `chart-builder-query-resource-missing`
- `chart-builder-query-measures-missing`
- `chart-builder-query-association-field-requires-subfield`
- `chart-visual-missing`
- `chart-visual-required-mappings-missing`
- `chart-visual-legacy-builder-keys-unsupported`
- `chart-sql-query-text-missing`
- `chart-custom-visual-raw-missing`

When a required chart returns one of these authoring errors, repair the same chart payload and retry it as `chart`. For whole-page `applyBlueprint`, keep `type: "chart"`, define `assets.charts.<key>.query` and `assets.charts.<key>.visual`, then reference it with `block.chart`. For localized writes, keep the existing chart block and repair `settings.query/settings.visual` or `changes.query/changes.visual`. Do not switch a required chart to `table`, `list`, `jsBlock`, `actionPanel`, `gridCard`, `markdown`, or a deferred note just because the first payload failed.

## 继续读

- [../chart-core.md](../chart-core.md)
- [../page-first-planning.md](../page-first-planning.md)
- [grid-card.md](grid-card.md)
- [../page-intent.md](../page-intent.md)
