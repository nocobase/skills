# Case 10 - 嵌套弹窗链路

## 测试目标

故意验证多层 drawer/dialog 链路、上下文传递和嵌套页面编排能力，判断当前 skill 与 NocoBase API 在复杂弹窗工作流下是否真正可用。

## 前置数据模型

- `customers`: 客户，字段至少包含 `id`、`name`
- `orders`: 订单，字段至少包含 `id`、`order_no`、`customer_id`、`status`
- `order_items`: 订单项，字段至少包含 `id`、`order_id`、`product_id`、`quantity`、`amount`
- `products`: 商品，字段至少包含 `id`、`name`、`sku`
- 关系：`orders.belongsTo(customers)`
- 关系：`order_items.belongsTo(orders)`
- 关系：`order_items.belongsTo(products)`

## 前置模拟数据

- `customers` 至少 3 条
- `products` 至少 5 条
- `orders` 至少 5 条，覆盖多个状态
- `order_items` 至少 10 条，且至少 1 笔订单拥有 3 条以上订单项
- 至少准备 1 笔“主验证订单”，它既有关联客户，也有多条订单项，便于连续验证订单详情抽屉、订单项编辑对话框和客户详情抽屉
- 至少准备 1 条便于精确搜索的订单号，用来验证第一层列表和上下文传递

## 测试 Prompt

```text
请使用 nocobase-ui-builder skill 帮我搭建一个“订单嵌套弹窗”验证页面，并记录完整工具调用日志，结束后生成复盘报告和自动改进建议。

页面目标如下：
1. 创建订单列表页，展示订单号、客户、状态。
2. 在订单表格中提供“查看详情”动作，打开订单详情抽屉。
3. 订单详情抽屉中展示订单详情区块和订单项表格。
4. 在订单项表格中提供“编辑订单项”对话框。
5. 在订单详情区域再提供“查看客户”动作，打开客户详情抽屉。
6. 如果嵌套 popup 的上下文无法稳定传递，请明确记录到底是哪一层 popup、哪一种动作、哪一个 model tree 出了问题。
7. 不要把子表 `belongsTo(orders)` 的字段名直接当成 `associationName` 就报成功；如果 relation resource 协议未证实，应明确保留 blocker。
8. “客户”列和“客户详情”都必须展示真实字段；只有列头或 drawer 标题、不显示任何客户字段值，不能算通过。
9. 主表“客户”列优先使用父表上的完整 dotted path，例如 `customer.name`，并显式补 `associationPathName=customer`；不要拆成 target collection + `associationPathName` + simple `fieldPath`。
10. 如果订单详情里的 `order_items` 表还没有已验证的 parent->child relation resource，允许保留 child-side 的逻辑 relation filter；不要为了“过 guard”伪造 `associationName`。同时，child-side filter 的路径必须来自 relation metadata，优先 `order_id`，否则 `order.<targetKey>`；不要写裸 `order`。
11. “编辑订单项”对话框里的 `Quantity` / `Amount` 必须是真正可编辑的 form field，不接受只有标签、只读占位或空壳。
12. 编辑表单的保存按钮必须挂在 `EditFormModel.subModels.actions` 对应的动作区，不接受把 `FormSubmitActionModel` 塞进 `FormGridModel.subModels.items` 后出现在字段区。

执行要求：
- 开始搭建 UI 之前，先准备并校验前置模拟数据，不要跳过这一步直接验证空页面。
- 最终结果里要交代订单、订单项、客户样本数量，以及哪笔订单被用作多层弹窗主验证样本。
```

## 最低验收标准

- 能完整验证至少两层 popup 链路的可行性
- 至少能基于一笔真实订单样本说明第一层和第二层 popup 是否拿到了正确上下文
- 能说明订单详情抽屉内订单项表格的挂载与动作情况
- 能确认订单项编辑对话框中的 `Quantity` / `Amount` 是否可编辑，以及保存按钮是否出现在表单动作区
- 能说明查看客户抽屉这条支线是否可行
- 如果客户列为空、客户 drawer 为空，必须单独记录为失败或 warning，不能混入“链路已打通”
- 如果 `order_items` 表用了 child-side 逻辑 relation filter，但能稳定命中当前订单的订单项，不应因为“没写 associationName”而被误判为失败
- 工具日志与复盘报告成功生成
- 对失败节点有明确而非模糊的描述
- 结果可直接用作 popup 相关优化的依据

## 重点验证的 NocoBase 能力

- `openView`
- popup collection actions
- 嵌套 drawer/dialog
- popup 内关系表格
- 跨层数据上下文传递

## 当前预期

这是高压边界用例，预期很容易暴露当前 API 和 skill 在多层 popup 上的不足。它的价值在于稳定复现问题，而不是追求完全跑通。

## 复盘关注点

- popup page 是否缺少足够清晰的摘要和挂载协议
- 多层 `openView` 是否需要更高层的配置模板
- 当前日志与报告是否足够还原复杂弹窗链路中的失败顺序
