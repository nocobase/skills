---
title: record actions
description: 查看、编辑、审批、新增下级等记录级动作的 tree 结构与上下文规则。
---

# record actions

## 适用区块与问题

适用于：

- 表格行动作
- 详情区块内动作
- 审批通过/驳回
- 新增下级节点
- 关系记录编辑

优先参考：

- [case5](../validation-cases/case5.md)
- [case7](../validation-cases/case7.md)
- [case8](../validation-cases/case8.md)
- [case10](../validation-cases/case10.md)

## 决策规则

- 如果动作面向“当前记录”，优先显式说明当前记录上下文从哪来
- 如果动作只是打开 popup / openView，继续按 [popup-openview.md](popup-openview.md) 补齐子树
- 如果动作会改写父子关系、through 记录或层级关系，继续按 [relation-context.md](relation-context.md) 校验上下文

## 最小成功标准

动作要算完成，至少需要：

- 动作节点已落库
- 动作目标对象明确
- 如果动作依赖当前记录，上下文来源可解释

如果只是按钮存在，但不知道到底对哪条记录生效，不能算完成。

## 常见误区

- 行级编辑动作没有 record id 来源
- 审批“通过/驳回”只有按钮壳，没有明确业务动作能力边界
- 新增下级部门动作没有父节点上下文
- 把动作按钮已落库误报成业务动作已可用

## 关联文档

- [../blocks/table.md](../blocks/table.md)
- [../blocks/details.md](../blocks/details.md)
- [../blocks/edit-form.md](../blocks/edit-form.md)
- [popup-openview.md](popup-openview.md)
- [relation-context.md](relation-context.md)
- [tree-table.md](tree-table.md)
