---
title: insight-first recipe
description: 面向总览、看板、趋势、KPI、交互说明页的候选生成 recipe；强调洞察主块优先，guard 只负责合法性。
---

# insight-first recipe

这个 recipe 的目标不是把页面变成固定模板，而是把 planner 的偏置从“先保住 table/details”改成“先表达洞察意图”。

适用请求：

- `总览`
- `概览`
- `趋势`
- `分布`
- `统计`
- `占比`
- `看板`
- `dashboard`
- `KPI`
- `交互说明`
- `叙事分析`

## 设计边界

这套 recipe 只做两件事：

1. 生成更合理的候选池
2. 给候选排序一个更符合语义的偏置

它不做三件事：

1. 不把页面锁死成唯一布局
2. 不把 guard 逻辑提前塞进 planner 排序
3. 不要求每个候选都带 `TableBlockModel` 或 `DetailsBlockModel`

## hard contract 与 soft recipe

### hard contract

hard contract 只负责“能不能合法落库”：

- `ChartBlockModel` 的 query/option mode 是否完整
- `GridCardBlockModel` 的 `item + grid` 子树是否完整
- `JSBlockModel` / RunJS 是否触发已知禁止项
- collection / field / relation metadata 是否满足写前要求

这些约束由：

- `patterns/payload-guard.md`
- `scripts/flow_payload_guard.mjs`
- `scripts/spec_contracts.mjs`

负责。

### soft recipe

soft recipe 只负责“先生成什么候选、优先选什么主块”：

- 请求像趋势/报表时，先推 `ChartBlockModel`
- 请求像 KPI 摘要时，先推 `GridCardBlockModel`
- 请求带交互说明/叙事层时，让 `JSBlockModel` 与 chart/grid-card 并列
- 如果 `filter + insight surface` 已经能表达意图，就允许不带 table/details

## 主块优先级

### chart-first

触发词：

- `趋势`
- `分布`
- `占比`
- `图表`
- `报表`
- `dashboard`

默认主块：

- `ChartBlockModel`

默认配对：

- `FilterFormBlockModel`
- `JSBlockModel`

### grid-card-first

触发词：

- `KPI`
- `指标卡`
- `summary`
- `overview`

默认主块：

- `GridCardBlockModel`

默认配对：

- `FilterFormBlockModel`
- `JSBlockModel`
- `ChartBlockModel`

### js-peer-first

触发词：

- `交互`
- `联动`
- `说明`
- `引导`
- `叙事`
- `自定义`

默认策略：

- `JSBlockModel` 不是页面骨架本身
- 但它可以成为 `insight` 或 `extension` 的主表达面
- 它通常应与 `ChartBlockModel` 或 `GridCardBlockModel` 配对，而不是孤立落单

## 候选布局

推荐至少生成这些候选：

1. `keyword-anchor`
2. `content-control`
3. `collection-workbench`
4. `analytics-mix`
5. `tabbed-multi-surface`

其中：

- `keyword-anchor` 适合让 chart/grid-card 直接做首页主视觉
- `analytics-mix` 适合 `chart/grid-card + js + support surface`
- `tabbed-multi-surface` 适合把主视图、记录面、洞察扩展拆开
- `collection-workbench` 仍然保留，但不应天然压过前面几类洞察候选

## 排序原则

`insight-first` 下，排序应优先看：

1. 是否命中明确的洞察主块
2. 是否形成 `chart-js`、`grid-js` 或 `chart-grid-js` 组合
3. 是否能在不引入多余稳定块的前提下表达页面目标

排序不应优先看：

1. 是否自带 `TableBlockModel`
2. 是否自带 `DetailsBlockModel`
3. 是否更接近传统工作台

## 允许的无 table/details 结果

下面这些都应视为合法候选，而不是异常：

- `FilterFormBlockModel + ChartBlockModel`
- `FilterFormBlockModel + ChartBlockModel + JSBlockModel`
- `FilterFormBlockModel + GridCardBlockModel + JSBlockModel`
- `ChartBlockModel + JSBlockModel`
- `GridCardBlockModel + JSBlockModel`

前提是：

- 请求目标确实是总览/趋势/KPI/交互说明
- hard contract 仍然能在写前通过

## fallback 时机

只允许两类 fallback：

1. 写前 guard 已经证明 payload 缺少必要 contract
2. compile 阶段已经证明当前候选不可安全落库

不允许在 planner 阶段因为“稳一点”就提前回退成：

- `Filter + Table`
- `Filter + Details`
- `Table + Details`

## 推荐输出

scenario 和 candidate 最少应保留：

- `creativeIntent`
- `selectedInsightStrategy`
- `jsExpansionHints`
- `visualizationSpec`

这样 review 阶段才能知道：

- 为什么它被选中
- 它偏向哪类洞察组合
- JS 是主块还是 peer
- chart 是 `builder/basic` 还是 `sql/custom`

## 继续读

- [page-first-planning.md](page-first-planning.md)
- [flow-model-recipes.md](flow-model-recipes.md)
- [blocks/chart.md](blocks/chart.md)
- [blocks/grid-card.md](blocks/grid-card.md)
- [js-models/index.md](js-models/index.md)
