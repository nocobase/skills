---
title: CreateFormModel
description: 新建表单壳、字段项、提交动作的分层完成标准。
---

# CreateFormModel

## 适用范围

- `CreateFormModel`
- `FormGridModel`
- `FormItemModel`
- `FormSubmitActionModel`

典型目标：

- 表格级“新建”弹窗或抽屉
- 详情页中的新增关系记录表单
- popup page 内的创建表单

优先参考动态场景：

- 订单履约 / 项目交付的主表工作台新建弹窗
- 详情区块里的关系记录新建链路
- 组织树页面里的“新增下级”表单

## 写前必查

1. `CreateFormModel`、`FormGridModel`、`FormItemModel`、`FormSubmitActionModel` schema
2. 当前场景要求的是“表单壳”还是“可实际填写的表单”
3. 如果表单通过 popup / openView 打开，继续看 [../patterns/popup-openview.md](../patterns/popup-openview.md)
4. 如果表单字段涉及关系赋值、父子记录绑定，继续看 [../patterns/relation-context.md](../patterns/relation-context.md)

## 最小成功树

纯壳层最低结构：

- `CreateFormModel`
- `subModels.grid`
- `subModels.actions[*] = FormSubmitActionModel`

真实可填写表单最低结构：

- 上面的壳层
- 至少一个 `FormItemModel`
- 每个 `FormItemModel` 都显式补 `subModels.field`
- `subModels.field.use` 必须来自当前 schema/field binding 暴露的 editable field candidates
- 每个关键字段都有明确 field renderer 或字段项结构

最小正确树提醒：

- `FormSubmitActionModel` 放在 `CreateFormModel.subModels.actions`，不要放进 `FormGridModel.subModels.items`
- `FormItemModel.stepParams.fieldSettings.init.fieldPath` 只负责字段绑定，不会自动替代 `subModels.field`

## 完成标准

- 如果用户只要求“提供新建入口”，表单壳可算部分完成，但必须明确说明没有字段项
- 如果用户要求“新建订单 / 新建发票 / 新建任务”等真实业务表单，只有壳层不算完成
- validation 场景里，不能把“打开了一个空表单壳”当成真正可用

## 常见陷阱

- 只有 `CreateFormModel + grid + submit`，没有任何字段项
- 提交动作存在，但没有说明它实际能提交什么数据
- 父子关系依赖运行时赋值，但没有明确 assign rule 或上下文来源
- `fieldPath` 正确，但 `FormItemModel.subModels.field` 缺失，结果只有字段壳或不可填写
- `FormSubmitActionModel` 被塞进 `grid.items`，结果按钮位置错误

## 关联模式文档

- [../patterns/popup-openview.md](../patterns/popup-openview.md)
- [../patterns/relation-context.md](../patterns/relation-context.md)

## 失败时如何降级

- 如果字段项 schema 仍未消歧，可以先保留稳定壳层
- 但最终必须明确写成“表单壳已完成，字段项未完成”，不能报成功
