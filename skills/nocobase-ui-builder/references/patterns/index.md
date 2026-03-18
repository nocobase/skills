---
title: UI 横切模式索引
description: 按现象或复杂模式查阅 nocobase-ui-builder 的细节文档。
---

# UI 横切模式索引

## 使用方式

当任务不只是“某个区块怎么建”，而是出现跨区块的细节问题时，优先从这里找模式文档：

- 表格列为什么不显示值
- popup / openView 的上下文怎么传
- 关系表为什么空表
- record action 如何拿到当前记录
- 树表、自关联、多对多、中间表字段怎么处理

如果模式文档仍不足以消歧，再回到 `GetFlowmodels_schema` / `PostFlowmodels_schemas` 做增量探测。

## 模式目录

| 模式 | 文档 | 解决的问题 | 关联区块 | 关联 case |
| --- | --- | --- | --- | --- |
| payload 守卫 | [payload-guard.md](payload-guard.md) | 写前 guard、risk-accept、filter/path/foreignKey 防错 | 所有会写 flowModels 的区块 | `case1` `case3` `case4` `case5` `case6` `case8` `case10` |
| 表格列渲染 | [table-column-rendering.md](table-column-rendering.md) | 列壳已创建但真实值不显示；字段类型到 display model 的映射；关联路径列 | `TableBlockModel` | `case1` `case10` |
| popup / openView | [popup-openview.md](popup-openview.md) | drawer/dialog/ChildPage、嵌套 popup、`filterByTk` 与 `ctx.view.inputArgs` | `TableBlockModel` `DetailsBlockModel` `CreateFormModel` `EditFormModel` | `case3` `case4` `case6` `case10` |
| 关系上下文 | [relation-context.md](relation-context.md) | 详情内关系表、popup 内关系表、外键过滤、through 关系挂接 | `TableBlockModel` `DetailsBlockModel` `FilterFormBlockModel` | `case2` `case3` `case5` `case6` `case8` `case10` |
| record actions | [record-actions.md](record-actions.md) | 查看/编辑/审批/新增下级等记录级动作树与上下文 | `TableBlockModel` `DetailsBlockModel` `EditFormModel` | `case5` `case7` `case8` `case10` |
| 树表与自关联 | [tree-table.md](tree-table.md) | `treeTable`、自关联、层级过滤、新增下级动作 | `TableBlockModel` | `case7` |
| 多对多与中间表 | [many-to-many-and-through.md](many-to-many-and-through.md) | 成员关系表、through 字段、关系记录编辑、关联选择器 | `TableBlockModel` `EditFormModel` | `case8` |

## 与 block 文档的关系

- 先按区块定位主文档：见 [../blocks/index.md](../blocks/index.md)
- 再按“当前卡住的细节”打开模式文档
- 模式文档不会替代 block 文档；它们只负责跨区块复用的注意事项
