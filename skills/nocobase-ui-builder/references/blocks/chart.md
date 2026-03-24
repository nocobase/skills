---
title: ChartBlockModel
description: Chart 区块的稳定配置路径、mode 组合、最小可用 recipe 与常见误配。
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

如果请求只是几个 KPI 数字摘要，没有明显图形语义，优先看 [grid-card.md](grid-card.md)。

## 真正的配置路径

Chart 的查询和 option 不走 `resourceSettings`，而是走：

- `stepParams.chartSettings.configure.query`
- `stepParams.chartSettings.configure.chart.option`
- `stepParams.chartSettings.configure.chart.events.raw`

最常见误配是把 collection 放进：

- `stepParams.resourceSettings.init.collectionName`

这对 chart 不是稳定查询入口。skill 应直接报错或回退，不要继续沿用 table/list 的思路。

## 最小稳定 recipe

```json
{
  "use": "ChartBlockModel",
  "stepParams": {
    "chartSettings": {
      "configure": {
        "query": {
          "mode": "builder",
          "collectionPath": ["main", "assets"],
          "measures": [
            {
              "field": "current_value",
              "aggregation": "sum",
              "alias": "sum_current_value"
            }
          ],
          "dimensions": [
            {
              "field": "status"
            }
          ]
        },
        "chart": {
          "option": {
            "mode": "basic",
            "builder": {
              "type": "pie",
              "pieCategory": "status",
              "pieValue": "sum_current_value"
            }
          }
        }
      }
    }
  }
}
```

这是 skill 默认应掌握的安全起点：

- `query.mode='builder'`
- `chart.option.mode='basic'`
- `query.collectionPath=['<dataSourceKey>', '<collectionName>']`
- `query.measures` 至少 1 项
- `chart.option.builder` 非空

## Query modes

### `builder`

必须显式提供：

- `chartSettings.configure.query.mode='builder'`
- `chartSettings.configure.query.collectionPath=['<dataSourceKey>', '<collectionName>']`
- `chartSettings.configure.query.measures=[...]`

推荐同时提供：

- `chartSettings.configure.query.dimensions=[...]`

这是首选模式。只要用户说“总览 / 趋势 / 分布 / 报表”，且我们已经有 collection metadata，就优先用它。

### `sql`

必须显式提供：

- `chartSettings.configure.query.mode='sql'`
- `chartSettings.configure.query.sqlDatasource`
- `chartSettings.configure.query.sql`

只有用户明确要求 SQL，或 builder 明显不够表达时，才切到 `sql`。

## Option modes

### `basic`

最稳。默认用这个。

但 `basic` 不是只写 `mode` 就能渲染；还必须有：

- `chartSettings.configure.chart.option.builder`

### `custom`

必须显式提供：

- `chartSettings.configure.chart.option.mode='custom'`
- `chartSettings.configure.chart.option.raw`

如果还要事件脚本，再加：

- `chartSettings.configure.chart.events.raw`

`custom` 只替换图表 option 生成方式，不豁免 query/dataSource/measures 约束。

不要出现“有 `events.raw`，但没声明 `option.mode`”的半配置状态。

## skill 默认策略

1. 命中 `总览 / 趋势 / 分布 / 统计 / 占比 / dashboard` 时，把 `ChartBlockModel` 视为 `insight` 区首选块。
2. 如果请求同时带 `交互 / 联动 / 说明 / 引导 / 叙事 / 自定义`，允许 `ChartBlockModel + JSBlockModel` 直接成为主表达组合，不必自动补 `Table/Details`。
3. 优先生成 `builder + basic`。
4. 用户明确说 `sql` 时，再生成 `sql + basic` 或 `sql + custom`。
5. 用户明确要求自定义 ECharts option / events 时，才生成 `custom`。
6. 如果当前拿不到稳定 collection 或 query 配置，先把缺口暴露给 guard / compile artifact；只有写前仍无法满足 contract 时才回退，不要在 planner 阶段提前保守化。

## guard 关注点

payload guard 应至少检查：

- `CHART_QUERY_MODE_MISSING`
- `CHART_OPTION_MODE_MISSING`
- `CHART_BUILDER_COLLECTION_PATH_MISSING`
- `CHART_COLLECTION_PATH_SHAPE_INVALID`
- `CHART_BUILDER_MEASURES_MISSING`
- `CHART_BASIC_OPTION_BUILDER_MISSING`
- `CHART_SQL_DATASOURCE_MISSING`
- `CHART_SQL_TEXT_MISSING`
- `CHART_CUSTOM_OPTION_RAW_MISSING`
- `CHART_QUERY_CONFIG_MISPLACED_IN_RESOURCE_SETTINGS`

`canonicalize-payload` 只允许自动补：

- `query.mode='builder'`
- `option.mode='basic'`

不要自动猜：

- `collectionPath`
- `sqlDatasource`
- `sql`
- `option.raw`

## 继续读

- [../page-first-planning.md](../page-first-planning.md)
- [grid-card.md](grid-card.md)
- [public-blocks-inventory.md](public-blocks-inventory.md)
