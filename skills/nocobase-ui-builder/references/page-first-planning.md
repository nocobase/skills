---
title: 页面优先编排
description: 先确定页面骨架与 section，再为各 section 选择区块实现。
---

# 页面优先编排

## 核心原则

先页面，后区块。

构建普通系统页面时，先根据用户意图规划页面骨架和几个语义 section，再为每个 section 选择最合适的 block。不要先从“有哪些 block”出发，再强行拼成一个页面。

`insight` 不是挂在页面尾部的附属区。命中 `总览 / 看板 / 趋势 / KPI / 交互说明` 时，`insight` 可以直接成为页面主 surface。

## 推荐骨架

- `focus-stack`
  - 适合单一主目标页面，通常只有一个主体区
- `split-workbench`
  - 适合主内容 + 一个辅助面
- `multi-section-workbench`
  - 适合主内容 + 多个补充信息区
- `tabbed-workbench`
  - 适合多个并列 surface，需要显式 tabs 承载

## 标准 section

- `controls`
  - 顶部控制区，负责筛选、切换视角、控制主体范围
- `primary`
  - 主业务区，承载页面最核心目标
- `secondary`
  - 辅助业务区，补充上下文或承接操作链路
- `insight`
  - 分析/指标/地图/列表等洞察区
- `extension`
  - 自定义说明、帮助信息、JS 扩展交互

## block 映射顺序

1. 先定 section 职责与数据边界
2. 再选实现 block
3. `ChartBlockModel` / `GridCardBlockModel` / `JSBlockModel` 在 `insight` 语义下都可以是一等主块
4. `JSBlockModel` 不是页面骨架本身，但在 `insight` / `extension` 中可以作为主表达面或 peer，不必等到“内置 block 不足”才启用

常见映射：

- `controls` -> `FilterFormBlockModel`
- `primary` -> `TableBlockModel` / `DetailsBlockModel` / `CreateFormModel` / `EditFormModel`
- `secondary` -> `TableBlockModel` / `DetailsBlockModel`
- `insight` -> `ChartBlockModel` / `GridCardBlockModel` / `ListBlockModel` / `MapBlockModel`
- `extension` -> `MarkdownBlockModel` / `JSBlockModel`

`insight` 区默认优先级：

- 命中 `总览 / 趋势 / 分布 / 统计 / 占比 / dashboard` 时，优先 `ChartBlockModel`
- 命中 `指标卡 / KPI / summary / overview` 且更像数字摘要时，优先 `GridCardBlockModel`
- 命中 `交互 / 联动 / 说明 / 引导 / 叙事 / 自定义` 时，允许 `JSBlockModel` 与 `ChartBlockModel / GridCardBlockModel` 并列，而不是自动退回 `Table/Details`

## 执行要求

1. planner 应先产出 `pagePlan`
2. build 阶段优先按 `pagePlan.sections[]` / `pagePlan.tabs[]` 逐区实现
3. review 阶段优先检查 section 职责是否成立，再检查 block 选型是否合适
4. 当页面效果差时，先反查 page skeleton 是否不合理，而不是先怪某个 block
