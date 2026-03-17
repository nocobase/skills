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
2. 优先用关系语义和元数据推导过滤路径，不要一上来硬编码 `f_*`
3. 如果当前实例只能靠物理外键名落库，也要在结果里明确写“环境相关风险”
4. 详情页、popup page、表格行，它们的上下文来源不同，不能混用

## 常见上下文来源

| 场景 | 稳定来源 |
| --- | --- |
| 主表行打开详情页 | `{{ctx.record.id}}` |
| popup page 内继续挂子表 | `{{ctx.view.inputArgs.filterByTk}}` |
| 详情区块下的关系表 | 先确认详情记录的 id 来源，再转成 relation filter |
| through / 中间表关系 | 先确认主记录 id，再确认 through 记录的过滤字段 |

## 最小成功标准

关系表格要算完成，至少需要：

- 明确的 `collectionName`
- 明确的 relation filter
- 能说明它会命中哪一条父记录及其哪些子记录

如果页面上表格存在，但 relation filter 仍靠猜，就只能算壳层。

## 常见误区

- 直接用 `f_*` 物理外键，不先看元数据
- 详情区块里把 `ctx.record` 当成一定存在
- popup 内关系表仍然引用上一层页面上下文
- 多对多场景只看到目标表，看不到 through 字段

## 已知边界

- 当前很多关系场景仍可能依赖实例内的外键物理名
- 复杂关联路径与 through 字段展示，通常比普通一对多更脆弱
- 如果最终没做 UI 回放，只能说明“flow tree 已落库”，不能直接说明 runtime 一定正确

## 关联文档

- [../blocks/filter-form.md](../blocks/filter-form.md)
- [../blocks/table.md](../blocks/table.md)
- [../blocks/details.md](../blocks/details.md)
- [popup-openview.md](popup-openview.md)
- [many-to-many-and-through.md](many-to-many-and-through.md)
