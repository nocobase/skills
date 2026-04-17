---
title: FilterFormBlockModel
description: 筛选区块的适用范围、完成标准、联动目标与常见陷阱。
---

# FilterFormBlockModel

## 适用范围

- `FilterFormBlockModel`
- `FilterFormGridModel`
- `FilterFormItemModel`
- `FilterFormSubmitActionModel`
- `FilterFormResetActionModel`

典型目标：

- 列表页顶部筛选
- 详情页上方的主记录筛选
- 与某张主表或关系表联动的查询入口

## 何时使用

- 用户明确要求“按订单号 / 状态 / 客户 / 日期筛选”
- validation case 需要证明页面不是空壳，而是能命中真实数据
- 页面主表已确定，需要一个稳定的筛选入口，而不是自由输入的表单壳

优先参考动态场景：

- 订单履约主表工作台
- 项目交付工作台
- 审批处理台

## 写前必查

1. `FilterFormBlockModel`、`FilterFormItemModel` 与目标字段渲染模型的 schema
2. 目标主表或目标区块的 `uid`
3. 要筛选的字段元数据
4. 如果筛选项包含关联字段或记录选择器，再看 [../patterns/relation-context.md](../patterns/relation-context.md)

## 最小成功树

在“真实可筛选”的场景里，最低结构应包括：

- `FilterFormBlockModel`
- `subModels.grid`
- 至少一个 `FilterFormItemModel`
- `FilterFormSubmitActionModel`
- `FilterFormResetActionModel`
- 每个筛选项都显式指向目标区块，例如 `defaultTargetUid`
- 承载这些区块的 `BlockGridModel` 顶层存在 `filterManager`

只有 block 壳、没有 items/actions，不能算完成。

## 完成标准

- 用户要求的关键筛选项都已经落库，而不是只创建空 grid
- 每个筛选项都绑定了明确的 `fieldPath`
- 每个筛选项的 `subModels.field.use` 与 `filterFormItemSettings.init.filterField` 都必须由字段 metadata 推导，不能把 `select/date/number/percent/time/association` 一律落成 `InputFieldModel`
- 提交 / 重置动作存在
- `subModels.actions[*].use` 必须来自 filter-form action family，例如 `FilterFormSubmitActionModel` / `FilterFormResetActionModel`；不要回退成泛型 `ActionModel`
- 筛选区块的目标表或目标区块可追踪，而不是隐式悬空
- `BlockGridModel.filterManager` 已把每个筛选项连接到明确 target，并且 `filterPaths` 与字段 metadata 一致
- validation 场景下，最终说明里能指出哪一条样本数据会被这些筛选项命中
- 写前已通过 [../patterns/payload-guard.md](../patterns/payload-guard.md) 审计

## 常见陷阱

- 只创建 `FilterFormBlockModel` 壳，不创建 item/action
- 筛选项存在，但没有绑定目标区块
- 只写 `defaultTargetUid`，却没把 grid 级 `filterManager` 持久化出来
- 关联字段筛选直接猜 `fieldPath` 或 `fieldNames`
- 把关联字段的 `foreignKey` 直接写成 `fieldPath`
- 日期字段只建了普通输入，不建对应日期筛选字段模型
- `select` / `radioGroup` / `checkboxGroup` / `boolean` / `percent` / `time` 字段沿用普通文本输入；这类错误通常不是 runtime 偶现，而是 skill 没按 metadata 选中正确 field model
- dotted scalar 路径直接把整个 `fieldPath` 当 descriptor.name；`manager.nickname` 这类路径应当使用 leaf field `nickname`
- 把“筛选区块已落库”误当成“已经可筛选”

## 关联模式文档

- [../patterns/relation-context.md](../patterns/relation-context.md)
- [../patterns/payload-guard.md](../patterns/payload-guard.md)
- [table.md](table.md)

## 失败时如何降级

- 如果某个复杂筛选项的字段渲染模型仍未消歧，优先保留简单且稳定的筛选项
- 如果目标区块 `uid` 尚未稳定，不要伪造联动；先明确说明筛选区块当前只能停在壳层
- 在 validation 场景里，如果最终无法命中样本数据，必须判为未完整通过
