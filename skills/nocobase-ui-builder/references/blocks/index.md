---
title: UI 区块文档索引
description: 按区块 use 查阅 nocobase-ui-builder 的细节文档与关联模式文档。
---

# UI 区块文档索引

## 使用方式

1. 先按 [../page-first-planning.md](../page-first-planning.md) 决定页面骨架和 section，而不是先挑 block。
2. 再从用户目标识别本轮主要区块 use。
3. 打开对应的 block 文档。
4. 再按 block 文档里的“关联模式文档”继续打开 `../patterns/*.md`。
5. 如果当前区块还没有专用文档，退回 [../index.md](../index.md)、[../ui-api-overview.md](../ui-api-overview.md) 和 [../flow-model-recipes.md](../flow-model-recipes.md) 的通用规则执行，并在日志里记录缺口。

推荐先读：

- [public-blocks-inventory.md](public-blocks-inventory.md)
- [../flow-schemas/index.md](../flow-schemas/index.md)

如果已经明确目标 block use，不要先打开大 artifact；先读 `models/<UseName>.json`，只有在当前 block 的 slot 或 schema 细节确实需要时，再按 ref 去读 `catalogs/` 和 `artifacts/`。

## JS Model / RunJS

当任务涉及 `JSBlockModel`、`JSColumnModel`、`JSFieldModel`、`JSItemModel`、`JSActionModel` 或任何 `runJs` 代码时，先读：

- [../js-models/index.md](../js-models/index.md)
- [../js-models/rendering-contract.md](../js-models/rendering-contract.md)

## 主干区块

| 区块 use | 文档 | 典型任务 | 常见关联模式 | 常见动态场景 |
| --- | --- | --- | --- | --- |
| `FilterFormBlockModel` | [filter-form.md](filter-form.md) | 列表页顶部筛选、主表联动 | `relation-context.md` | 订单履约主表工作台、审批处理台 |
| `TableBlockModel` | [table.md](table.md) | 主表、关系表、抽屉内子表、树表 | `table-column-rendering.md` `popup-openview.md` `relation-context.md` `tree-table.md` `many-to-many-and-through.md` | 订单履约、项目交付、审批运营、组织运营 |
| `DetailsBlockModel` | [details.md](details.md) | 详情页、抽屉详情、详情内动作/关系表 | `relation-context.md` `popup-openview.md` `record-actions.md` | 客户增长 360、审批运营 360、项目交付总览 |
| `CreateFormModel` | [create-form.md](create-form.md) | 新建弹窗、抽屉表单、详情内新建入口 | `popup-openview.md` `relation-context.md` | 主表工作台、新增记录链路、树形新增下级 |
| `EditFormModel` | [edit-form.md](edit-form.md) | 编辑弹窗、关系记录编辑、二层编辑对话框 | `popup-openview.md` `relation-context.md` `record-actions.md` | 主表编辑、关系表编辑、审批处理编辑 |
| `ChartBlockModel` | [chart.md](chart.md) | 趋势/分布/占比/报表图 | `../page-first-planning.md` `../insight-first-recipe.md` | 分析看板、趋势页、统计总览 |
| `GridCardBlockModel` | [grid-card.md](grid-card.md) | KPI 卡片、指标总览 | `../page-first-planning.md` `../insight-first-recipe.md` | 总览页、经营概览、审批摘要 |
| `PageModel` / `RootPageTabModel` / `PageTabModel` | [page-and-tabs.md](page-and-tabs.md) | 默认隐藏 tab、显式 tabs、多标签页面 | `popup-openview.md` | 多标签业务工作台、协作/分析/地图分屏页面 |
| `JSBlockModel` / `JSColumnModel` / `JSFieldModel` / `JSItemModel` / `JSActionModel` | [../js-models/index.md](../js-models/index.md) | 自定义渲染、自定义交互、runJs 代码生成 | [../js-models/rendering-contract.md](../js-models/rendering-contract.md) | 需要定制展示或按钮逻辑的页面 |

## 先看横切模式的场景

| 现象或目标 | 优先文档 | 常见动态场景 |
| --- | --- | --- |
| 表格列存在，但页面不显示真实值 | [../patterns/table-column-rendering.md](../patterns/table-column-rendering.md) | 订单履约主表、多标签工作台 |
| drawer / dialog / ChildPage / 嵌套 popup | [../patterns/popup-openview.md](../patterns/popup-openview.md) | 主表工作台、360 工作台、多层详情链路 |
| 详情页内关系表、popup 内关系表、外键过滤 | [../patterns/relation-context.md](../patterns/relation-context.md) | 客户增长 360、审批详情、项目总览 |
| 记录级动作，如查看/编辑/审批/新增下级 | [../patterns/record-actions.md](../patterns/record-actions.md) | 审批处理台、组织树页面 |
| 树表、自关联、层级型数据 | [../patterns/tree-table.md](../patterns/tree-table.md) | 组织运营树形运维页面 |
| 多对多、中间表字段、成员关系编辑 | [../patterns/many-to-many-and-through.md](../patterns/many-to-many-and-through.md) | 项目交付成员管理、复杂关系编辑 |

## 场景对照

| 动态场景 | 建议先读 |
| --- | --- |
| 订单履约主表工作台 | `filter-form.md` `table.md` `create-form.md` `edit-form.md` `table-column-rendering.md` |
| 客户增长 360 工作台 | `details.md` `table.md` `relation-context.md` `popup-openview.md` |
| 项目交付多标签工作台 | `page-and-tabs.md` `details.md` `table.md` `record-actions.md` |
| 审批处理台 | `filter-form.md` `table.md` `details.md` `record-actions.md` `relation-context.md` |
| 组织树形运维页面 | `table.md` `tree-table.md` `record-actions.md` |
| 分析看板 / 趋势页 / 交互叙事页 | `../insight-first-recipe.md` `chart.md` `grid-card.md` `../page-first-planning.md` `../js-models/index.md` |
