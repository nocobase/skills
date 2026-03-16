# Case 2 - 客户 360 工作台

## 测试目标

验证同一页面中多个关系数据区块并排存在时，`nocobase-ui-builder` 是否还能保持稳定的探测、定位和写入，而不是只适合单一区块场景。

## 前置数据模型

- `customers`: 客户，字段至少包含 `id`、`name`、`owner_id`、`level`
- `contacts`: 联系人，字段至少包含 `id`、`customer_id`、`name`、`phone`、`email`
- `opportunities`: 商机，字段至少包含 `id`、`customer_id`、`title`、`status`、`amount`
- `activities`: 跟进记录，字段至少包含 `id`、`customer_id`、`type`、`content`、`created_at`
- 关系：`contacts.belongsTo(customers)`
- 关系：`opportunities.belongsTo(customers)`
- 关系：`activities.belongsTo(customers)`

## 测试 Prompt

```text
请使用 nocobase-ui-builder skill 帮我创建一个“客户 360 工作台”页面，并记录完整工具调用日志，结束后生成复盘报告。

页面目标如下：
1. 创建一个 v2 页面，标题为“客户 360 工作台”。
2. 页面顶部放一个客户详情区块，展示客户名称、客户等级、负责人等基础信息。
3. 下方放三个关系数据区块，分别展示联系人、商机、跟进记录。
4. 联系人表格支持查看联系人弹窗和编辑联系人弹窗。
5. 商机表格支持查看商机弹窗和编辑商机弹窗。
6. 如果关系数据区块需要额外上下文，请先明确探测和读取，不要直接猜测。

执行要求：
- 必须完整记录工具日志与关键 note。
- 如果某个关系区块或弹窗动作做不到，请保留已完成部分并明确指出具体缺口。
- 最终给我一份可复盘的结果总结。
```

## 最低验收标准

- 页面壳和详情区块能创建成功
- 至少两个关系数据区块能落到页面上
- 若弹窗动作未完整实现，也要明确指出卡在何处
- 工具日志与复盘报告成功生成
- 未误用内部抽象模型
- 最终结果能说明这个场景是否接近真实可用

## 重点验证的 NocoBase 能力

- `DetailsBlockModel`
- 多个 `TableBlockModel` 共页布局
- `GetFlowmodels_findone` 对现有 grid 的实时读取
- `openView` 对查看/编辑弹窗的支持
- 关系数据上下文与 record actions

## 当前预期

这是偏主干的复杂页面用例，应该至少能把客户详情区块和多个关系表格搭起来。弹窗链路如果不完整，也应该能清楚暴露出缺少哪一层能力。

## 复盘关注点

- 页面里多个区块并存时，是否会出现重复探测和重复写入
- 关系表格的 collection 上下文是否容易丢失
- 是否需要额外的页面摘要 API 来降低复杂页面的编排成本
