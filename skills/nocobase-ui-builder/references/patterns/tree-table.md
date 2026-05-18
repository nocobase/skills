---
title: 树表与自关联
description: 树表模式、自关联层级数据和新增下级动作的注意事项。
---

# 树表与自关联

## 适用区块与问题

适用于：

- `TableBlockModel` 的树表模式
- 自关联数据
- “新增下级”这类依赖父节点的动作

优先参考动态场景：

- 组织运营树形运维页面

## 核心规则

- 先确认 collection 里是否真的存在自关联关系
- 再确认表格是否需要 `treeTable` 相关设置
- 父节点上下文必须明确，不能默认假设当前记录里总有 parent 信息
- 显式 `fields[]` 必须自洽：第一列应是 live metadata 里的直连可读字段；如果第一列不可读，只能把显式列表里已有的可读字段移动到第一列，不能额外注入缺失的 `title` / `name`。
- 只有省略 `fields[]` 时才按默认优先级选首列：优先 collection 的 `titleField`，其次 `name`，其次 `code`，其次 `title`，再选其他带非空 `interface` 的直连非关联字段。
- 不要把 `id`、`uid`、`uuid`、`parentId`、主键、外键、`xxxId` / `xxxUid`、`_id` 或 `_uid` 放在树表第一列；后端会拒绝这些不可读 ID/UID 字段作为 applyBlueprint 树表首列。
- 树表默认不要写 `recordActions: ["view", "edit", "delete"]`。除非用户明确要求某个行级动作，否则省略 `recordActions`，让后端只注入默认 `addChild`。
- 如果用户明确要求树表 `edit` / `delete`，可以显式写入对应 `recordActions`；不要为了“默认行级动作”补 `view`。

## 最小成功标准

树表场景至少要能回答：

- 树表设置是否已落库
- 已知的层级样本是否能映射到当前表格
- 新增下级动作拿到的父节点上下文是什么

## 常见误区

- 只创建普通表格，却在说明里说成树表
- 自关联关系存在，但表格没有树表配置
- 新增下级动作没有父节点上下文

## 已知边界

- 树表通常比普通表格更依赖运行时层级展开逻辑
- 如果没有浏览器交互回放，最终只能说明 flow tree 和样本映射，不代表 UI 展开一定正确

## 关联文档

- [../blocks/table.md](../blocks/table.md)
- [record-actions.md](record-actions.md)
- [relation-context.md](relation-context.md)
