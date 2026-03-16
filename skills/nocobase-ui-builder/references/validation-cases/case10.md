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
```

## 最低验收标准

- 能完整验证至少两层 popup 链路的可行性
- 能说明订单详情抽屉内订单项表格的挂载与动作情况
- 能说明查看客户抽屉这条支线是否可行
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
