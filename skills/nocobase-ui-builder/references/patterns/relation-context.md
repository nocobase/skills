---
title: 关系上下文
description: 关系表格、详情内关系区块、popup 内子表和 through 关系的上下文与过滤规则。
---

# 关系上下文

## 适用区块与问题

适用于：

- 详情内关系表
- popup 内关系子表
- 关联字段筛选
- 一对多 / 多对多 / through 场景

优先参考动态场景：

- 客户增长 360 详情联动页
- 审批运营详情与日志链路
- 项目交付复杂关系页和成员编辑
- popup 内关系子表与 through 场景

## 核心规则

1. 先查 collection / field 元数据，再写 relation filter
2. relation/dataScope condition 只能写 `{ path, operator, value }`，不要写 `{ field, operator, value }`
3. 优先用关系语义和元数据推导逻辑字段名，不要把 `foreignKey` 直接当成 `fieldPath`
4. child-side `belongsTo` 过滤不能写成“裸 association + 标量操作符”；`path` 必须优先取 `foreignKey`，否则改成 `<belongsToField>.<targetKey>`；拿不到 relation metadata 就保持 blocker
5. 如果是“当前记录下的关联子表”，只有在 parent->child relation resource 已被验证时才优先使用 `resourceSettings.init.associationName + sourceId`；未验证前允许保留 child-side 的逻辑 `dataScope.filter`
6. `associationName` 不能只靠子表上 `belongsTo(parent)` 的字段名猜；`order` 和 `order_items.order` 这类 child-side 写法都不算已验证资源协议
7. 详情页、popup page、表格行，它们的上下文来源不同，不能混用
8. 写前先跑 [payload-guard.md](payload-guard.md)；guard 报 blocker 时不要继续落库

## 常见上下文来源

| 场景 | 稳定来源 |
| --- | --- |
| 主表行打开详情页 | 按当前 record context 的 `filterTargetKey` 展开；单键是 `{{ctx.record.<filterTargetKey>}}`，复合键是对象模板 |
| popup page 内继续挂子表 | 若 parent->child resource 已验证，则用 `sourceId = {{ctx.view.inputArgs.filterByTk}}` 配合 `associationName`；否则保留 child-side 的逻辑 relation filter，但 `path` 必须来自 relation metadata，不允许裸 `belongsTo` 字段名直接配标量操作符 |
| 详情区块下的关系表 | 先确认详情记录的 id 来源，再转成 relation filter |
| through / 中间表关系 | 先确认主记录 id，再确认 through 记录的过滤字段 |

## 最小成功标准

关系表格要算完成，至少需要：

- 明确的 `collectionName`
- 明确的 relation filter，或更稳定的 `associationName + sourceId` 协议
- 如果用了 `associationName + sourceId`，必须能解释这个 `associationName` 是如何被验证的
- 能说明它会命中哪一条父记录及其哪些子记录

如果页面上表格存在，但 relation filter 仍靠猜，就只能算壳层。

## 常见误区

- 直接用 `f_*` 或 `customer_id` / `owner_id` 这类物理外键，不先看元数据
- 明明是 `belongsTo` child-side filter，却直接写裸 `order` / `customer` 再配 `$eq`
- 详情区块里把 `ctx.record` 当成一定存在
- popup 内关系表仍然引用上一层页面上下文
- 明明 parent->child resource 还没验证，却为了“看起来更高级”强行把 child-side filter 改写成 `associationName + sourceId`
- 明明还没验证 relation resource 协议，就直接把 child `belongsTo` 字段名写成 `associationName`
- 多对多场景只看到目标表，看不到 through 字段

## 已知边界

- 当前很多关系场景仍可能依赖实例内的外键物理名
- 复杂关联路径与 through 字段展示，通常比普通一对多更脆弱
- 如果最终没做 UI 回放，只能说明“flow tree 已落库”，不能直接说明 runtime 一定正确

## 关联文档

- [../blocks/filter-form.md](../blocks/filter-form.md)
- [../blocks/table.md](../blocks/table.md)
- [../blocks/details.md](../blocks/details.md)
- [payload-guard.md](payload-guard.md)
- [popup-openview.md](popup-openview.md)
- [many-to-many-and-through.md](many-to-many-and-through.md)
