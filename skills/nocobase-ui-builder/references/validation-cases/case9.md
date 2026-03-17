# Case 9 - 客户运营多标签工作台

## 测试目标

故意验证多标签页面能力，而不是只验证默认隐藏 tab 的主干路径，观察当前 skill 和 API 在多 tab 页面上的可用程度。

## 前置数据模型

- `customers`: 客户，字段至少包含 `id`、`name`、`level`
- `contacts`: 联系人，字段至少包含 `id`、`customer_id`、`name`
- `opportunities`: 商机，字段至少包含 `id`、`customer_id`、`title`、`status`
- `activities`: 跟进记录，字段至少包含 `id`、`customer_id`、`content`、`created_at`
- 关系：`contacts.belongsTo(customers)`
- 关系：`opportunities.belongsTo(customers)`
- 关系：`activities.belongsTo(customers)`

## 前置模拟数据

- `customers` 至少 4 条，覆盖不同客户等级
- `contacts` 至少 6 条
- `opportunities` 至少 5 条，覆盖多个商机状态
- `activities` 至少 8 条，覆盖不同时间和内容
- 至少准备 1 个核心客户，其联系人、商机、跟进记录都不为空，便于验证多 tab 页面切换后不是空数据

## 测试 Prompt

```text
请使用 nocobase-ui-builder skill 帮我搭建一个“客户运营工作台”，并记录完整工具调用日志，结束后生成复盘报告。

页面目标如下：
1. 创建一个带多个可见标签的页面。
2. 标签分别为“客户概览”“联系人”“商机”“跟进记录”。
3. “客户概览”标签下展示客户详情或客户主表。
4. 其他三个标签分别放联系人表格、商机表格、跟进记录表格。
5. 如果当前 skill 只能稳定处理 `createV2` 默认创建的隐藏 tab，请不要绕开问题，明确指出多标签页到底缺了哪些 API 或写入协议。

执行要求：
- 开始搭建 UI 之前，先准备并校验前置模拟数据，不要跳过这一步直接验证空页面。
- 最终结果里要单独交代每类业务数据的样本数量，以及多标签页面是否真的能读到这些数据。
```

## 最低验收标准

- 能明确验证多标签页面是否可搭建
- 能说明至少一个标签下的区块是否成功读到前置模拟数据，而不是只有壳层
- 能说明每个标签对应 grid 的可用性或缺失点
- 对默认隐藏 tab 与显式 tab 的支持边界给出清晰结论
- 工具日志和报告产物成功生成
- 输出中有明确的缺口分析
- 结果可用于指导 tab 相关 API 优化

## 重点验证的 NocoBase 能力

- `RootPageModel` 或 `PageModel` 的 tabs 结构
- `RootPageTabModel` / `PageTabModel` 与各自 `grid`
- 多 tab 页面下的 block 编排
- page summary / tab summary 的必要性

## 当前预期

这是边界 case，重点不是完成业务页面，而是确认多标签页目前离真实可用还有多远。非常适合用来检验是否需要新增 tab 级聚合 API。

## 复盘关注点

- skill 是否缺少 tab 层的稳定定位协议
- 当前 API 是否只有默认隐藏 tab 的主路径，缺少多 tab 创建与摘要
- 多标签页是否必须引入新的页面聚合读写 API 才能真正可用
