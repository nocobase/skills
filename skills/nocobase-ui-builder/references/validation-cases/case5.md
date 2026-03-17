# Case 5 - 审批处理台

## 测试目标

验证详情区块、关系日志表格和记录级操作在一个审批业务场景中的组合能力，重点观察 record actions 是否足够实用。

## 前置数据模型

- `approval_requests`: 审批单，字段至少包含 `id`、`title`、`applicant_id`、`department_id`、`status`、`submitted_at`
- `users`: 用户，字段至少包含 `id`、`nickname`
- `departments`: 部门，字段至少包含 `id`、`name`
- `approval_logs`: 审批日志，字段至少包含 `id`、`approval_request_id`、`operator_id`、`action`、`comment`、`created_at`
- 关系：`approval_requests.belongsTo(users)`
- 关系：`approval_requests.belongsTo(departments)`
- 关系：`approval_logs.belongsTo(approval_requests)`
- 关系：`approval_logs.belongsTo(users)`

## 前置模拟数据

- `users` 至少 4 条，覆盖申请人、审批人等不同角色
- `departments` 至少 3 条
- `approval_requests` 至少 6 条，覆盖 `pending`、`approved`、`rejected` 等状态
- `approval_logs` 至少 10 条，且至少 1 张审批单拥有 3 条以上审批日志
- 至少准备 1 张待审批单据，便于验证“通过/驳回”动作所在的上下文是否真实可用

## 测试 Prompt

```text
请使用 nocobase-ui-builder skill 帮我创建一个“审批处理台”页面，并在执行过程中记录完整工具日志，结束后生成复盘报告。

页面目标如下：
1. 页面顶部放审批单筛选区块，可按标题、状态、申请人、部门筛选。
2. 页面主体放审批单表格，展示标题、申请人、部门、状态、提交时间。
3. 点击某条审批单后，打开详情区块，展示审批单基础信息。
4. 在详情区块下展示审批日志关系表格。
5. 在详情区块或记录动作区域提供“通过”和“驳回”操作。
6. 如果当前动作配置做不到真正可用，请明确说明是 record action、弹窗还是数据上下文出了问题。

执行要求：
- 开始搭建 UI 之前，先准备并校验前置模拟数据，不要跳过这一步直接验证空页面。
- 最终说明中要交代审批单、审批日志的样本数量，以及哪张待审批单被用作主验证样本。
```

## 最低验收标准

- 审批单主页面和筛选区块能搭建成功
- 详情区块或等价查看链路中至少能读到一张真实的待审批样本和其审批日志
- 详情区块和审批日志关系表能至少完成主体结构
- 能对通过/驳回动作的实现程度给出清晰结论
- 工具日志和复盘报告成功生成
- 对未完成项有结构化说明
- 最终结果可作为后续优化 record action 的依据

## 重点验证的 NocoBase 能力

- `DetailsBlockModel`
- `TableBlockModel`
- record actions
- 详情页中的关系日志表格
- 主表到详情页的数据上下文传递

## 当前预期

这个场景应该能较好检验详情区块和记录动作的可用性。页面主体大概率能完成，但“通过/驳回”这类动作的真正业务可用性未必够稳。

## 复盘关注点

- record action 的 flow model 写法是否仍然过于隐式
- 详情区块与日志表格是否需要更高层模板
- 是否应该补充动作类常见 pattern 到 skill reference 中
