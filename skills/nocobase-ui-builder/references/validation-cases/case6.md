# Case 6 - 发票与回款工作台

## 测试目标

验证一对多关系表格、多个弹窗入口、主表与详情混合编排的综合场景，作为主干可用性阶段的收尾用例。

## 套件定位

- 分层：`core-pass`
- 预期结果：`pass`
- 主责任：覆盖同页多个 popup action、`CreateFormModel`、`EditFormModel`
- 辅助覆盖：`popup-openview`、`relation-context`

## 前置数据模型

- `customers`: 客户，字段至少包含 `id`、`name`
- `orders`: 订单，字段至少包含 `id`、`order_no`
- `invoices`: 发票，字段至少包含 `id`、`invoice_no`、`customer_id`、`order_id`、`status`、`amount`
- `payments`: 回款记录，字段至少包含 `id`、`invoice_id`、`paid_amount`、`paid_at`、`remark`
- 关系：`invoices.belongsTo(customers)`
- 关系：`invoices.belongsTo(orders)`
- 关系：`payments.belongsTo(invoices)`

## 前置模拟数据

- `customers` 至少 3 条
- `orders` 至少 4 条，确保至少 3 张订单已被发票引用
- `invoices` 至少 6 条，覆盖 `draft`、`issued`、`partial_paid`、`paid` 等状态
- `payments` 至少 8 条，且至少 1 张发票拥有 2 条以上回款记录
- 至少准备 1 张可精确搜索的发票号，1 张部分回款发票，1 张已回款完成发票

## 测试 Prompt

```text
请使用 nocobase-ui-builder skill 帮我搭建一个“发票与回款工作台”，并记录完整工具调用日志，结束后生成复盘报告和自动改进建议。

页面目标如下：
1. 创建一个发票列表页面，展示发票号、客户、关联订单、状态、金额。
2. 提供“新建发票”和“编辑发票”弹窗入口。
3. 点击查看发票后，显示发票详情。
4. 在发票详情中展示回款记录关系表格。
5. 提供“登记回款”动作，用弹窗或抽屉打开回款表单。
6. 如果当前场景中的某个动作或关系区块做不到，请保留可完成部分，并在结尾明确给出缺口说明。

执行要求：
- 开始搭建 UI 之前，先准备并校验前置模拟数据，不要跳过这一步直接验证空页面。
- 最终结果里要单独说明发票和回款样本数量，以及哪张发票被用作主验证样本。
```

## 最低验收标准

- 发票主表与主要字段可搭建成功
- 发票详情或关系区块至少能读到一张带回款记录的真实发票样本
- 至少一个发票表单入口可建出主体结构
- 回款关系表格的可行性被明确验证
- 执行日志和报告产物存在
- 对动作和关系区块的完成度有清晰说明
- 最终能判断这个场景距离真实业务可用还有多远

## 重点验证的 NocoBase 能力

- `TableBlockModel`
- `CreateFormModel`
- `EditFormModel`
- 发票详情展示
- 回款关系表格
- 多个 popup action 共存

## 当前预期

这是主干可用性阶段的综合场景，页面主体和表单壳应尽量能完成。多个动作共存时如果出现步骤冗长或参数不直观，会非常适合作为优化输入。

## 复盘关注点

- 同一页面多个 popup action 是否会引发重复探测
- 回款这种关系表单是否缺少稳定的最小成功模板
- 当前 skill 的最终结果是否已足够让业务用户继续微调
