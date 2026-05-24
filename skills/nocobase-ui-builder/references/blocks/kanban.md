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

如果只有 `分析看板 / dashboard / trend / KPI / 概览` 这类分析词，没有 kanban cue，优先回到 [chart.md](chart.md) 或 [../js-models/js-block.md](../js-models/js-block.md)。其中趋势/分布/排行走 chart，KPI/数字统计走 JSBlock。

## 主块规则

- public 主块可以直接放 `fields[]`
- 主块不支持 `fieldGroups`
- 主块不支持 `fieldsLayout`
- 主块不支持 `recordActions`
- whole-page `applyBlueprint` 的 direct non-template `kanban` 主块最多只能显式放 2 个 `fields[]` 卡片展示字段；`compose` / `addBlock` 不受这个 2 字段上限影响

卡片主内容放在主块 `fields[]`。快速新建和卡片查看内容应放进 hidden quick-create / card-view popup hosts，而不是主块 `recordActions` 或 field-grid 语义里。

如果 `applyBlueprint` 的 direct non-template `kanban` 省略 `fields[]`，backend authoring 会从 live metadata 自动选择最多 2 个适合卡片展示的字段：必须有非空 `interface`，排除 `id`、audit、hidden、primaryKey、sort、当前 `groupField` 和 `dragSortBy`，并优先标题字段或业务可读字段。调用者显式给出 3 个或更多字段时，backend aggregate validation 返回 `kanban-main-fields-too-many`；不要自动裁剪显式字段。

## 拖拽排序

- `applyBlueprint` direct non-template `kanban` 默认 `settings.dragEnabled=true`
- 如果 live metadata 里已有和当前 `groupField` 兼容的 `interface=sort` 字段，backend authoring 会绑定 `settings.dragSortBy`
- 如果没有兼容 sort 字段，backend authoring 会在可写 main datasource 集合上自动创建 hidden sort 字段并绑定
- 显式 `settings.dragEnabled=false` 必须保留，并且不会自动创建 sort 字段
- 显式 `settings.dragSortBy` 必须是和 `groupField` scope 兼容的 sort 字段；不兼容时返回 validation error，不静默替换

## Hidden popups

- 快速新建弹窗放在 `settings.quickCreatePopup`
- 卡片点击/查看弹窗放在 `settings.cardPopup`
- whole-page `create` 下，direct non-template `kanban` 如果省略这些 hidden popup，backend authoring 会补 `{ tryTemplate: true }`
- 同一场景下，backend authoring 会在缺省时补 `settings.quickCreateEnabled=true` 和 `settings.enableCardClick=true`
- 显式配置必须保留：`false` 开关、`tryTemplate:false`、`template`、本地 `blocks`、`uid`、`mode`、`size` 都不要被覆盖
- popup materialize、defaults completeness、metadata discovery，以及显式 `groupField` 的严格校验细节统一由 backend authoring 处理；见 [../page-blueprint.md](../page-blueprint.md)。

## 默认筛选与动作

- direct non-template public `kanban` authoring 可以省略 `defaultFilter`；backend authoring 会根据 live metadata 自动生成最多 4 个默认筛选字段，并默认把筛选/搜索落到同一个 kanban host 的 block-level `filter` action。只有覆盖默认字段时才显式写 `defaultFilter`；显式空组、非法 operator 或未知字段路径都会通过 aggregate `errors[]` 返回
- 只有用户显式要求筛选区块/查询表单时才升级到 `FilterFormBlockModel`
- 主块允许的 public actions 只有 `filter`、`addNew`、`popup`、`refresh`、`js`、`jsItem`
- 不要在主块上放 `today`、`turnPages`、`bulkDelete`、`triggerWorkflow` 或 record-level actions

## 继续读

- [../page-first-planning.md](../page-first-planning.md)
- [../page-blueprint.md](../page-blueprint.md)
- [chart.md](chart.md)
