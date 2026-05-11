---
title: KanbanBlockModel
description: Kanban 区块的主块约束、默认筛选规则与 analytics 看板的分流。
---

# KanbanBlockModel

## 什么时候优先用

当请求明显指向下面这些 cue 时，优先收窄到 `KanbanBlockModel`，不要继续走 chart / grid-card 的分析看板路径：

- `看板区块`
- `kanban`
- `pipeline`
- `status columns`
- `拖拽`
- `泳道`
- `backlog`

如果只有 `分析看板 / dashboard / trend / KPI / 概览` 这类分析词，没有 kanban cue，优先回到 [chart.md](chart.md) 或 [grid-card.md](grid-card.md)。

## 主块规则

- public 主块可以直接放 `fields[]`
- 主块不支持 `fieldGroups`
- 主块不支持 `fieldsLayout`
- 主块不支持 `recordActions`

卡片主内容放在主块 `fields[]`。快速新建和卡片查看内容应放进 hidden quick-create / card-view popup hosts，而不是主块 `recordActions` 或 field-grid 语义里。

## Hidden popups

- 快速新建弹窗放在 `settings.quickCreatePopup`
- 卡片点击/查看弹窗放在 `settings.cardPopup`
- whole-page `create` 下，direct non-template `kanban` 如果省略这些 hidden popup，backend authoring 会补 `{ tryTemplate: true }`
- 同一场景下，backend authoring 会在缺省时补 `settings.quickCreateEnabled=true` 和 `settings.enableCardClick=true`
- 显式配置必须保留：`false` 开关、`tryTemplate:false`、`template`、本地 `blocks`、`uid`、`mode`、`size` 都不要被覆盖
- helper 的 popup materialize、defaults completeness、metadata discovery，以及显式 `groupField` 的严格校验细节统一看 [../helper-contracts.md](../helper-contracts.md)

## 默认筛选与动作

- direct non-template public `kanban` authoring 可以省略 `defaultFilter`；backend authoring 会根据 live metadata 自动生成 3-4 个、最多 4 个默认筛选字段，并默认把筛选/搜索落到同一个 kanban host 的 block-level `filter` action。只有覆盖默认字段时才显式写 `defaultFilter`；显式空组、非法 operator 或未知字段路径都会通过 aggregate `errors[]` 返回
- 只有用户显式要求筛选区块/查询表单时才升级到 `FilterFormBlockModel`
- 主块允许的 public actions 只有 `filter`、`addNew`、`popup`、`refresh`、`js`、`jsItem`
- 不要在主块上放 `today`、`turnPages`、`bulkDelete`、`triggerWorkflow` 或 record-level actions

## 继续读

- [../page-first-planning.md](../page-first-planning.md)
- [../page-blueprint.md](../page-blueprint.md)
- [chart.md](chart.md)
