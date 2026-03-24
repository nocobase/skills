---
title: GridCardBlockModel
description: Grid card 区块的最小稳定树、两层 actions slot 语义与 KPI/概览场景选型。
---

# GridCardBlockModel

## 什么时候优先用

当用户意图更像 KPI 摘要，而不是趋势图时，优先把它放进 `insight` section：

- `指标卡`
- `KPI`
- `总览`
- `概览`
- `summary`
- `overview`

如果用户明确要求趋势、分布、占比或报表图形，优先看 [chart.md](chart.md)。

## 最小稳定树

```json
{
  "use": "GridCardBlockModel",
  "stepParams": {
    "resourceSettings": {
      "init": {
        "dataSourceKey": "main",
        "collectionName": "assets"
      }
    },
    "GridCardSettings": {
      "columnCount": {
        "xs": 1,
        "md": 2,
        "lg": 3,
        "xxl": 4
      },
      "rowCount": {
        "rowCount": 3
      }
    }
  },
  "subModels": {
    "item": {
      "use": "GridCardItemModel",
      "subModels": {
        "grid": {
          "use": "DetailsGridModel",
          "subModels": {
            "items": []
          }
        },
        "actions": []
      }
    },
    "actions": []
  }
}
```

skill 至少要知道三件事：

- `subModels.item.use` 必须是 `GridCardItemModel`
- `subModels.item.subModels.grid.use` 必须是 `DetailsGridModel`
- block 与 item 各有一层 `actions`，语义不同

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

不要把两层 action 混用。skill 和 guard 都应该显式区分。

## skill 默认策略

1. 命中 `指标卡 / KPI / 总览 / 概览 / summary / overview` 时，把 `GridCardBlockModel` 视为 `insight` 区候选。
2. 如果请求只需要几个关键指标数字，优先 grid card，而不是 chart。
3. 如果请求同时带 `交互 / 联动 / 说明 / 引导 / 叙事 / 自定义`，允许 `GridCardBlockModel + JSBlockModel` 并列成为 insight 组合，不必自动补 `Table/Details`。
4. 默认先生成空的 `actions: []`，不要为了“看起来完整”乱猜 action use。
5. 如果 item subtree 缺失，先补 `GridCardItemModel + DetailsGridModel`，再继续下游字段/动作配置。

## guard 关注点

payload guard 应至少检查：

- `GRID_CARD_ITEM_SUBMODEL_MISSING`
- `GRID_CARD_ITEM_USE_INVALID`
- `GRID_CARD_ITEM_GRID_MISSING_OR_INVALID`
- `GRID_CARD_BLOCK_ACTION_SLOT_USE_INVALID`
- `GRID_CARD_ITEM_ACTION_SLOT_USE_INVALID`

validation case 下，缺 `item` 或 `grid` 应视为 blocker，因为这是高频“落库成功但页面空白”的来源。

## 继续读

- [../page-first-planning.md](../page-first-planning.md)
- [chart.md](chart.md)
- [public-blocks-inventory.md](public-blocks-inventory.md)
