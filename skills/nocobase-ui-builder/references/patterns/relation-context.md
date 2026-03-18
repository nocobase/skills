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

优先参考：

- [case2](../validation-cases/case2.md)
- [case3](../validation-cases/case3.md)
- [case5](../validation-cases/case5.md)
- [case6](../validation-cases/case6.md)
- [case8](../validation-cases/case8.md)
- [case10](../validation-cases/case10.md)

## 核心规则

1. 先查 collection / field 元数据，再写 relation filter
2. relation/dataScope condition 只能写 `{ path, operator, value }`，不要写 `{ field, operator, value }`
3. 优先用关系语义和元数据推导逻辑字段名，不要把 `foreignKey` 直接当成 `fieldPath`
4. 如果是“当前记录下的关联子表”，优先使用 `resourceSettings.init.associationName + sourceId`；`ctx.view.inputArgs.filterByTk` 更适合作为 `sourceId`，不是默认鼓励你手写 `dataScope.filter`
5. `associationName` 不能只靠子表上 `belongsTo(parent)` 的字段名猜；先确认该名字在当前实例里真能映射到可访问资源
6. 详情页、popup page、表格行，它们的上下文来源不同，不能混用
7. 写前先跑 [payload-guard.md](payload-guard.md)；guard 报 blocker 时不要继续落库

## 常见上下文来源

| 场景 | 稳定来源 |
| --- | --- |
| 主表行打开详情页 | `{{ctx.record.id}}` |
| popup page 内继续挂子表 | `sourceId = {{ctx.view.inputArgs.filterByTk}}`，并配已验证的 `associationName` |
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
- 详情区块里把 `ctx.record` 当成一定存在
- popup 内关系表仍然引用上一层页面上下文
- 明明是“当前记录关联子表”，却退化成普通 `TableBlockModel + dataScope.filter`
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
