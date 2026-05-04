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

如果请求只是几个 KPI 数字摘要，没有明显图形语义，优先看 [grid-card.md](grid-card.md)。

如果请求带 `kanban / pipeline / 状态列 / 拖拽 / 泳道 / backlog / 看板区块` 这类明确 kanban cue，不要继续走 chart，改看 [kanban.md](kanban.md)。

## Whole-page public blueprint 写法

在 `applyBlueprint` 里，chart block 不接受 `stepParams`。必须把图表配置放进 `assets.charts`，然后在 block 上用 `chart` 引用资产 key：

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
- builder chart query 默认只使用宿主 collection 的 scalar 字段，例如 `"amount"`、`"status"`、`"employerGroupId"`。
- 不要在 builder chart query 的 `measures[]` / `dimensions[]` / `sorting[]` / `orders[]` 里写 relation path：数组路径如 `["customer", "name"]` 或 dotted string 如 `"customer.name"` 都会被本地 helper 拦截。
- 本地错误码是 `CHART_BUILDER_RELATION_FIELD_RUNTIME_UNSUPPORTED` / `chart-builder-relation-field-runtime-unsupported`。
- 如果图表必须按 relation 的显示名称分组，改用 SQL chart 显式 join 并设置稳定 alias；只接受显示 ID 时，才用 scalar foreign key 作为 fallback。
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

## guard 关注点

payload guard 应至少检查：

- `CHART_QUERY_MODE_MISSING`
- `CHART_BUILDER_RESOURCE_MISSING` / `CHART_BUILDER_COLLECTION_PATH_MISSING`
- `CHART_BUILDER_MEASURES_MISSING`
- `CHART_VISUAL_TYPE_MISSING`
- `CHART_VISUAL_MAPPINGS_MISSING`
- `CHART_VISUAL_LEGACY_BUILDER_KEYS_UNSUPPORTED`
- `CHART_BUILDER_RELATION_FIELD_RUNTIME_UNSUPPORTED`
- `CHART_QUERY_RELATION_TARGET_FIELD_UNRESOLVED`
- `CHART_QUERY_FIELD_PATH_SHAPE_UNSUPPORTED`
- `CHART_SQL_TEXT_MISSING`
- `CHART_CUSTOM_OPTION_RAW_MISSING`

## 继续读

- [../chart-core.md](../chart-core.md)
- [../page-first-planning.md](../page-first-planning.md)
- [grid-card.md](grid-card.md)
- [../page-intent.md](../page-intent.md)
