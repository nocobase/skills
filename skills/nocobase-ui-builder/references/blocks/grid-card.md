---
title: GridCardBlockModel
description: Grid card 区块的最小稳定树、两层 actions slot 语义与记录卡片场景选型。
---

# GridCardBlockModel

## 什么时候优先用

当用户意图是多条业务记录的卡片式展示时，优先把它放进 `primary` 或 `insight` section：

- `产品卡片`
- `客户卡片`
- `任务卡片`
- `卡片列表`
- `record cards`
- `grid cards`

如果用户明确要求趋势、分布、占比或报表图形，优先看 [chart.md](chart.md)。

如果用户要求的是 `KPI`、`指标卡`、`数字统计`、`统计卡`、`追踪产品数`、`待阅数`、`本周新增数` 或类似“显示一个/多个数字”的 Dashboard 指标，优先用 [../js-models/js-block.md](../js-models/js-block.md) 的 JSBlock 统计面板。不要用 GridCard 来模拟数字统计，因为 GridCard 是记录展示块，省略业务数据范围时会展示普通记录而不是聚合数值。

## 最小稳定树

```json
{
  "type": "gridCard",
  "title": "资产指标",
  "collection": "assets",
  "defaultFilter": {
    "logic": "$and",
    "items": [
      {
        "path": "name",
        "operator": "$includes",
        "value": ""
      },
      {
        "path": "status",
        "operator": "$eq",
        "value": ""
      }
    ]
  },
  "settings": {
    "columns": {
      "xs": 1,
      "sm": 1,
      "md": 2,
      "lg": 3,
      "xl": 3,
      "xxl": 4
    },
    "rowCount": 3
  },
  "fields": []
}
```

skill 至少要知道三件事：

- public authoring 使用 `settings.columns` 控制列数，可以传数字或包含 `xs` / `sm` / `md` / `lg` / `xl` / `xxl` 的响应式对象
- `subModels.item.use` 必须是 `GridCardItemModel`
- `subModels.item.subModels.grid.use` 必须是 `DetailsGridModel`
- block 与 item 各有一层 `actions`，语义不同

## 默认筛选要求

- 如果用户明确说“给卡片 / Grid / GridCard 增加筛选 / 搜索功能”，默认先落该数据块自己的 `filter` action。
- public `gridCard` authoring（`applyBlueprint` / `compose` / `add-block` / `add-blocks`）可以省略 `defaultFilter`；后端会根据 live metadata 自动生成不超过四个标量/可筛选字段。只有需要覆盖默认字段时才显式写 `defaultFilter`；显式空组、非法 operator 或未知字段路径都会通过 aggregate `errors[]` 返回。
- Whole-page / `compose` authoring 可用 `actions: ["filter"]` 或 `{ "type": "filter" }`。
- 只有用户显式要求筛选区块 / 搜索区块 / 查询表单时，才升级为 `FilterFormBlockModel`。

## 两层 actions slot

### `GridCardBlockModel.subModels.actions`

这是 collection actions 槽位。只放 collection action uses。

常见用途：

- 新建
- 刷新
- 跳转
- 集合级工具条

### `GridCardItemModel.subModels.actions`

这是 record actions 槽位。只放 record action uses。

常见用途：

- 查看
- 编辑
- 删除
- record popup

不要把两层 action 混用。skill 文档和 backend aggregate `errors[]` 都应该显式区分。

## skill 默认策略

1. 命中 `产品卡片 / 客户卡片 / 任务卡片 / 卡片列表 / record cards` 时，把 `GridCardBlockModel` 视为记录展示候选。
2. 如果请求只需要几个关键指标数字，优先 `JSBlockModel` 统计面板，而不是 grid card。
3. 如果请求同时带 `交互 / 联动 / 说明 / 引导 / 叙事 / 自定义`，允许 `GridCardBlockModel + JSBlockModel` 并列成为 insight 组合，不必自动补 `Table/Details`。
4. 默认先生成空的 `actions: []`，不要为了“看起来完整”乱猜 action use。
5. 如果 item subtree 缺失，先补 `GridCardItemModel + DetailsGridModel`，再继续下游字段/动作配置。

## Backend validation 关注点

Backend authoring 会补齐 direct public data surface 的默认 actions，并校验 action slot 语义。对 GridCard 来说，最重要的边界是：

- collection action 只能放在 block `actions`。
- record action 只能放在 item/record 层 `recordActions`。
- 缺省 `defaultFilter` 可由 backend 依 live metadata 生成；显式空组、非法 operator、未知字段路径会通过 aggregate `errors[]` 返回。
- `settings.columns` 是 public 列数入口，不要使用旧别名。

如果 readback 出现 item/grid 子树缺失，视为 backend 或模型编译问题处理，不再依赖 skill-local 写前脚本。

## 继续读

- [../page-first-planning.md](../page-first-planning.md)
- [chart.md](chart.md)
- [../page-intent.md](../page-intent.md)
