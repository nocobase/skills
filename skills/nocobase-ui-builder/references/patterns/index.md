---
title: UI 横切模式索引
description: 按现象或复杂模式查阅 nocobase-ui-builder 的细节文档。
---

# UI 横切模式索引

## 使用方式

当任务不只是“某个区块怎么建”，而是出现跨区块的细节问题时，优先从这里找模式文档：

- 表格列为什么不显示值
- 关联标题列为什么点开不稳
- popup / openView 的上下文怎么传
- 关系表为什么空表
- record action 如何拿到当前记录
- 树表、自关联、多对多、中间表字段怎么处理
- JS model 应该如何写渲染代码

如果模式文档仍不足以消歧，再回到 [../ui-api-overview.md](../ui-api-overview.md) 的 schema-first 流程，按 `GetFlowmodels_schema` / `PostFlowmodels_schemas` 做增量探测。

如果当前已经明确目标 `use`，优先先看 [../flow-schemas/index.md](../flow-schemas/index.md) 与对应的 `models/<UseName>.json`；只有当前 slot 或具体 schema 细节还不够，再继续读 `catalogs/<OwnerUse>.<slot>.json` 或对应 artifact。

## 模式目录

| 模式 | 文档 | 解决的问题 | 关联区块 | 常见动态场景 |
| --- | --- | --- | --- | --- |
| payload 守卫 | [payload-guard.md](payload-guard.md) | 写前 guard、risk-accept、filter/path/foreignKey 防错 | 所有会写 flowModels 的区块 | 所有 dynamic validation build |
| JS 渲染契约 | [../js-models/rendering-contract.md](../js-models/rendering-contract.md) | 渲染型 JS model 应该用 `ctx.render()`，而不是 `ctx.element.innerHTML` 或 `return value` | `JSBlockModel` `JSColumnModel` `JSFieldModel` `JSItemModel` | JSBlock、JSColumn、JSField、JSItem |
| 表格列渲染 | [table-column-rendering.md](table-column-rendering.md) | 列壳已创建但真实值不显示；字段类型到 display model 的映射；关联路径列 | `TableBlockModel` | 订单履约、项目交付、多标签工作台 |
| 可点击关联列 | [clickable-relation-column.md](clickable-relation-column.md) | 关联标题字段展示、点击打开 popup、原生列与 JS workaround 的优先级 | `TableBlockModel` | 图书管理、客户台账、订单工作台 |
| popup / openView | [popup-openview.md](popup-openview.md) | drawer/dialog/ChildPage、嵌套 popup、`filterByTk` 与 `ctx.view.inputArgs` | `TableBlockModel` `DetailsBlockModel` `CreateFormModel` `EditFormModel` | 主表工作台、360 工作台、多层详情链路 |
| 关系上下文 | [relation-context.md](relation-context.md) | 详情内关系表、popup 内关系表、外键过滤、through 关系挂接 | `TableBlockModel` `DetailsBlockModel` `FilterFormBlockModel` | 客户增长 360、审批详情、项目复杂关系页 |
| record actions | [record-actions.md](record-actions.md) | 查看/编辑/审批/新增下级等记录级动作树与上下文 | `TableBlockModel` `DetailsBlockModel` `EditFormModel` | 审批处理台、组织树、复杂详情页 |
| 树表与自关联 | [tree-table.md](tree-table.md) | `treeTable`、自关联、层级过滤、新增下级动作 | `TableBlockModel` | 组织运营树形运维页面 |
| 多对多与中间表 | [many-to-many-and-through.md](many-to-many-and-through.md) | 成员关系表、through 字段、关系记录编辑、关联选择器 | `TableBlockModel` `EditFormModel` | 项目交付成员管理、复杂关系编辑 |

## 与 block 文档的关系

- 先按区块定位主文档：见 [../blocks/index.md](../blocks/index.md)
- 再按“当前卡住的细节”打开模式文档
- 模式文档不会替代 block 文档；它们只负责跨区块复用的注意事项
- 只要问题落在 RunJS / JS Model，优先回到 [../js-models/index.md](../js-models/index.md)
