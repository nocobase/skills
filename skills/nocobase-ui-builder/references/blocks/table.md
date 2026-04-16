---
title: TableBlockModel
description: 主表、关系表、树表与动作列的最小成功树、完成标准和关联模式入口。
---

# TableBlockModel

## 适用范围

- `TableBlockModel`
- `TableColumnModel`
- `TableActionsColumnModel`

典型目标：

- 主列表页
- 详情抽屉或 popup 内的关系子表
- 同页多个表格并存
- 树表
- 多对多 / 中间表关系表

优先参考动态场景：

- 订单履约 / 项目交付 / 审批运营的主表工作台
- 客户增长 / 审批运营的详情内关系表
- 组织运营树形运维页面
- 项目交付的多对多 / through 关系页

## 何时使用

- 用户要展示一组记录
- 用户要在表格上挂查看 / 编辑 / 新建 / 行级动作
- 用户要在详情区块或弹窗里展示一对多、多对多或 through 表

## 写前必查

1. `TableBlockModel` 与 `TableColumnModel` schema
2. 目标 collection 的字段元数据
3. 当前 live grid / popup page 子树
4. 如果用户要求“列里显示真实值”，继续看 [../patterns/table-column-rendering.md](../patterns/table-column-rendering.md)
5. 如果有 popup / drawer / dialog 动作，继续看 [../patterns/popup-openview.md](../patterns/popup-openview.md)
6. 如果是关系表，继续看 [../patterns/relation-context.md](../patterns/relation-context.md)
7. 如果是树表，继续看 [../patterns/tree-table.md](../patterns/tree-table.md)
8. 如果是多对多或中间表，继续看 [../patterns/many-to-many-and-through.md](../patterns/many-to-many-and-through.md)

## 最小成功树

按场景区分：

- 纯壳层场景：
  - `TableBlockModel`
  - `resourceSettings`
  - 基本 `tableSettings`
- 真实可见列表场景：
  - `TableBlockModel`
  - 至少一个 `TableColumnModel`
  - 每个目标列按 [../patterns/table-column-rendering.md](../patterns/table-column-rendering.md) 带上 `subModels.field`
- 带动作场景：
  - 额外带 `TableActionsColumnModel`
  - 列内 action tree 明确落库

## 完成标准

- 主表或关系表已绑定明确的 `collectionName`
- 用户要求显示的关键列都已创建
- 如果用户要求真实显示数据，每个关键列都必须带字段渲染子树，而不是只有列壳
- 如果用户要求行级或表格级动作，动作列或 `actions` 已落库
- 如果用户显式要求记录级 popup 动作，`TableActionsColumnModel` 里的 row actions 也算满足，但必须能证明 action tree 稳定
- 如果是关系表，过滤上下文明确，且能说明会命中哪组样本数据

## 常见陷阱

- 只有 `TableColumnModel`，没有 `subModels.field`，导致列壳存在但页面不显示值
- 先补 popup 动作壳，却把主表可见列做成半成品
- 直接硬写 `customer.name` 这类关联路径，却漏掉 `associationPathName`，导致 runtime 拿不到关联 append
- 把关联展示字段拆成 `target collection + associationPathName + simple fieldPath`，导致列壳存在但真实值为空
- 关系表直接硬编码 `f_*` 外键，不先查元数据
- 把“表格区块已落库”误当成“表格已真实可用”

## 关联模式文档

- [../patterns/table-column-rendering.md](../patterns/table-column-rendering.md)
- [../patterns/popup-openview.md](../patterns/popup-openview.md)
- [../patterns/relation-context.md](../patterns/relation-context.md)
- [../patterns/tree-table.md](../patterns/tree-table.md)
- [../patterns/many-to-many-and-through.md](../patterns/many-to-many-and-through.md)

## 失败时如何降级

- 主干列表页优先保证“表格能显示真实数据”，再去补复杂 popup / 表单壳
- 如果列渲染模型未消歧，不要把列壳当完成；应明确降级为“仅表格壳”或缩减到稳定列
- 对复杂关系表，优先给出明确过滤上下文和已命中的样本，再决定是否继续补动作树
