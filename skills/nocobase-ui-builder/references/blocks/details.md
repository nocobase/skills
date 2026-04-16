---
title: DetailsBlockModel
description: 详情区块、详情内动作与详情内关系表的完成标准和注意事项。
---

# DetailsBlockModel

## 适用范围

- `DetailsBlockModel`
- `DetailsGridModel`

典型目标：

- 主记录详情页
- drawer / dialog 内的详情内容
- 详情区块下再挂动作或关系表

优先参考动态场景：

- 客户增长 360 工作台
- 审批运营详情与日志联动
- 多层 popup / details 链路

## 写前必查

1. `DetailsBlockModel` schema
2. 当前记录上下文来源
   - 主表行动作
   - popup `inputArgs`
   - 页面级已知 record id
3. 如果详情内还要挂关系表，继续看 [../patterns/relation-context.md](../patterns/relation-context.md)
4. 如果详情里还要挂“查看客户”“通过/驳回”等动作，继续看 [../patterns/popup-openview.md](../patterns/popup-openview.md) 和 [../patterns/record-actions.md](../patterns/record-actions.md)

## 最小成功树

在“真实可读详情”场景里，最低结构应包括：

- `DetailsBlockModel`
- 明确的 `resourceSettings` 或 `filterByTk` 来源
- `subModels.grid`
- `subModels.grid` 里至少一种可见内容：详情字段、动作或子业务区块

如果用户要求详情内动作或关系表，则它们是同一业务链路的一部分，不应默默省略。

## 完成标准

- 详情区块能绑定到一条真实样本记录
- 至少能说明该样本记录是谁，例如某张采购单、某条审批单、某笔订单
- 不能只有标题和空 grid；如果没有任何字段、动作或子业务区块，只能算“详情壳”
- 如果用户要求详情内关系表或动作，需要明确说明它们是已落库、部分完成，还是阻塞
- 不能把“详情壳已创建”误报为“详情已可用”

## 常见陷阱

- 详情区块没有明确 record context
- 详情区块只有 `DetailsGridModel`，没有任何字段或子节点
- 详情区块里继续挂关系表，但 relation filter 没写清楚
- 在详情区块里直接依赖隐式 `ctx.record`，却没有说明上下文来源
- 详情动作已挂上，但实际打不开正确记录

## 关联模式文档

- [../patterns/relation-context.md](../patterns/relation-context.md)
- [../patterns/popup-openview.md](../patterns/popup-openview.md)
- [../patterns/record-actions.md](../patterns/record-actions.md)

## 失败时如何降级

- 如果详情记录上下文仍未稳定，优先明确记录 blocker，不要伪造详情可用
- 如果详情主体能落库，但关系表或动作尚未稳定，要分别报告完成度
