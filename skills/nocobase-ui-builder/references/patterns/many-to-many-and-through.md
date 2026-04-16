---
title: 多对多与中间表
description: 多对多关系表、中间表字段、成员关系编辑与关联选择器的边界说明。
---

# 多对多与中间表

## 适用区块与问题

适用于：

- 多对多成员表
- through / 中间表字段展示
- “添加成员”“编辑角色”这类关系记录编辑
- 关联选择弹窗

优先参考动态场景：

- 项目交付里的成员管理、多对多关系表
- 复杂关系编辑和 through 字段展示

## 核心规则

- 先分清目标表字段和 through 表字段
- 不要把“看到了目标表记录”误当成“中间表字段也已可用”
- 如果动作会改 through 记录，必须明确到底编辑的是目标记录还是中间表记录

## 最小成功标准

一个多对多关系表要算完成，至少要能回答：

- 主记录是谁
- 关系表读的是哪张资源
- 中间表字段是否真的可见
- 添加成员 / 编辑角色到底落到了哪种动作树

## 常见误区

- 只展示目标表字段，忽略 through 字段
- 选择器能弹出，但不知道写回哪张表
- 编辑动作存在，但其实编辑的是用户而不是成员关系记录

## 已知边界

- 这类场景通常比一对多关系更容易暴露 schema 与 runtime 的缺口
- 如果当前 API 还缺 relation block 的聚合表达，应该明确写成 blocker，而不是伪装为普通表格已完成

## 关联文档

- [../blocks/table.md](../blocks/table.md)
- [../blocks/edit-form.md](../blocks/edit-form.md)
- [relation-context.md](relation-context.md)
- [record-actions.md](record-actions.md)
