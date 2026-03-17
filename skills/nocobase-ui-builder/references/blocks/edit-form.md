---
title: EditFormModel
description: 编辑表单、记录上下文、filterByTk 与二层编辑弹窗的注意事项。
---

# EditFormModel

## 适用范围

- `EditFormModel`
- `FormGridModel`
- `FormItemModel`
- `FormSubmitActionModel`

典型目标：

- 表格行上的“编辑”动作
- popup / drawer / dialog 中的编辑表单
- 二层弹窗里的关系记录编辑

优先参考用例：

- [case1](../validation-cases/case1.md)
- [case4](../validation-cases/case4.md)
- [case6](../validation-cases/case6.md)
- [case10](../validation-cases/case10.md)

## 写前必查

1. `EditFormModel` schema
2. 当前记录上下文如何进入表单
   - 表格行 `ctx.record.id`
   - popup `ctx.view.inputArgs.filterByTk`
   - 明确提供的 record id
3. 如果编辑表单通过动作树打开，继续看 [../patterns/popup-openview.md](../patterns/popup-openview.md)
4. 如果是关系记录或 through 记录编辑，继续看 [../patterns/relation-context.md](../patterns/relation-context.md)
5. 如果动作是 record action，继续看 [../patterns/record-actions.md](../patterns/record-actions.md)

## 最小成功树

纯壳层最低结构：

- `EditFormModel`
- 明确的 record context
- `subModels.grid`
- `FormSubmitActionModel`

真实可编辑表单最低结构：

- 上面的壳层
- 至少一个 `FormItemModel`
- 关键字段项可写

## 完成标准

- 如果用户要求“编辑某条记录”，必须有明确的 record context
- 只有表单壳、没有字段项时，最多只能算部分完成
- 如果 `filterByTk` 或等价上下文是隐式依赖，而不是稳定模板，最终说明里必须点明风险

## 常见陷阱

- 编辑动作存在，但没有显式 record context
- 用 popup 壳代替真实可编辑表单
- 二层编辑弹窗里继续依赖外层隐式上下文，导致跨层 record 丢失

## 关联模式文档

- [../patterns/popup-openview.md](../patterns/popup-openview.md)
- [../patterns/relation-context.md](../patterns/relation-context.md)
- [../patterns/record-actions.md](../patterns/record-actions.md)

## 失败时如何降级

- 如果 record context 仍未稳定，不要把编辑表单报成完成
- 如果只能先落壳，最终必须单独说明“编辑入口已搭，record context 或字段项未完成”
