---
title: popup / openView
description: drawer/dialog/ChildPage、嵌套 popup 与上下文传递的常见模式。
---

# popup / openView

## 适用区块与问题

适用于：

- `AddNewActionModel`
- `EditActionModel`
- `ViewActionModel`
- popup page / `ChildPageModel`
- 多层 drawer / dialog

优先参考：

- [case3](../validation-cases/case3.md)
- [case4](../validation-cases/case4.md)
- [case6](../validation-cases/case6.md)
- [case10](../validation-cases/case10.md)

## 最小 tree 形状

一个稳定的 popup/openView 通常至少包含：

1. action model
2. `popupSettings.openView`
3. `subModels.page`
4. page 下至少一个 tab
5. tab 下的 grid
6. grid 下的实际 block

只写 action 壳，不写 page/tab/grid 子树，不能算真正可用。

## 上下文来源

常见来源如下：

| 场景 | 常见来源 |
| --- | --- |
| 主表行 -> 第一层详情弹窗 | `{{ctx.record.id}}` |
| popup page 内部 block | `{{ctx.view.inputArgs.filterByTk}}`，若是关联子表优先写成 `associationName + sourceId`，但先证明该 association resource 真的可用 |
| 二层 popup 继续编辑当前子表记录 | 先取当前弹窗表格行的 `{{ctx.record.id}}`，再传给下一层 `filterByTk` |
| 详情动作查看关联客户 | 只有在当前详情 record 结构明确时，才使用类似 `{{ctx.record.customer.id}}` 的表达式 |

## 决策规则

- 能显式写 `filterByTk` 时，优先显式写，不要完全依赖隐式 runtime 注入
- 对 popup 内“当前记录的关联子表”，优先走 `resourceSettings.init.associationName + sourceId`，不要先退化成普通 `dataScope.filter`
- `associationName` 不能只复用子表指向父表的 `belongsTo` 字段名；没有稳定 reference、live tree 或样板页佐证时，不要把它写成“已完成”
- 多层 popup 时，每一层都要能说清楚“输入参数从哪一层来”
- popup page 下的 block 一律假设自己依赖 `ctx.view.inputArgs`，不要擅自跨层偷用外层上下文
- popup/openView 相关 payload 写前先跑 [payload-guard.md](payload-guard.md)

## 常见误区

- 只有 action 按钮，没有完整 page/tab/grid 子树
- 第一层 popup 能打开，但第二层继续依赖外层 `ctx.record`
- 不区分“当前列表行 record”与“当前 popup inputArgs”
- 把子表 `belongsTo(parent)` 的字段名直接当成 `associationName` 提交，却没有证明运行时资源真的存在
- 对关联客户这类深路径表达式不做说明，直接报成功
- popup page 下业务 block 依赖 `ctx.view.inputArgs.filterByTk`，但 action 层没有显式传 `filterByTk`

## 完成标准

- 已落库：action tree、page、tab、grid、block 都存在
- 已解释：每一层 popup 的 record context 来源都能说清楚
- 已验证：如果还没做浏览器交互回放，最终结果必须明确写成“模型树已落库，运行时上下文未实测”

## 关联文档

- [../blocks/table.md](../blocks/table.md)
- [../blocks/details.md](../blocks/details.md)
- [../blocks/create-form.md](../blocks/create-form.md)
- [../blocks/edit-form.md](../blocks/edit-form.md)
- [payload-guard.md](payload-guard.md)
- [relation-context.md](relation-context.md)
- [record-actions.md](record-actions.md)
