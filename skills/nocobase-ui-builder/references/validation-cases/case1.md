# Case 1 - 订单中心主页面

## 测试目标

验证 `nocobase-ui-builder` 是否能基于当前 v2 页面壳与 `flowModels` 公共模型，搭建一个真实可用的订单管理主页面，而不是只创建空白区块壳。

## 前置数据模型

- `customers`: 客户，字段至少包含 `id`、`name`、`level`
- `orders`: 订单，字段至少包含 `id`、`order_no`、`customer_id`、`status`、`total_amount`、`created_at`
- `order_items`: 订单明细，字段至少包含 `id`、`order_id`、`product_id`、`quantity`、`amount`
- `products`: 商品，字段至少包含 `id`、`name`、`sku`、`price`
- 关系：`orders.belongsTo(customers)`
- 关系：`order_items.belongsTo(orders)`
- 关系：`order_items.belongsTo(products)`

## 前置模拟数据

- `customers` 至少 3 条，覆盖新客、普通客户、VIP 客户，且至少 1 个客户拥有 2 笔以上订单
- `products` 至少 5 条，价格区间有明显差异
- `orders` 至少 6 条，覆盖 `draft`、`pending`、`paid`、`completed`、`cancelled` 等状态
- `order_items` 至少 12 条，且至少 1 笔订单包含 3 条以上明细
- 至少准备 1 个可精确搜索的订单号，1 个可用于按客户筛选的样本，1 个可用于按时间范围筛选的近期开单样本

## 测试 Prompt

```text
请使用 nocobase-ui-builder skill 帮我创建一个“订单中心”页面，并把这次执行的完整工具调用记录到日志文件，结束后自动生成复盘报告和改进建议。

页面目标如下：
1. 创建一个 v2 页面，标题为“订单中心”。
2. 页面顶部放一个筛选区块，用来按订单号、客户、状态、下单时间筛选。
3. 页面主体放一个订单表格区块，至少展示订单号、客户名称、状态、订单金额、下单时间。
4. 表格上提供“新建订单”动作，使用弹窗或抽屉打开创建订单表单。
5. 表格行上提供“编辑订单”动作，使用弹窗或抽屉打开编辑订单表单。
6. 如果你能稳定生成字段和动作子树，就一次性提交完整 flow model tree；如果某部分当前能力不足，不要硬猜参数，明确记录阻塞点。

执行要求：
- 在开始搭建 UI 之前，先准备并校验前置模拟数据，不要把造数省略成空壳页面验证。
- 必须先探测 schemaBundle、schemas、findOne，再写入。
- 在最终结果里单独说明造了哪些数据、各表记录数分别是多少。
- 记录每一次 MCP 工具调用和本地脚本调用。
- 结束后输出日志路径、报告路径，以及这个场景下最值得优化的 1 到 3 个点。
```

## 最低验收标准

- 能创建或识别目标页面壳，不跳过探测步骤
- 订单表格和相关筛选至少能命中一部分前置模拟数据，而不是空列表
- 至少成功创建筛选区块、订单表格区块，以及创建/编辑订单入口中的大部分结构
- 不直接提交 `FormBlockModel`、`BlockGridModel`、`PopupCollectionActionModel` 等内部模型作为根区块
- 工具调用日志完整，失败调用也被记录
- 能生成复盘报告和自动改进产物
- 最终说明中明确区分已完成部分与当前能力缺口

## 重点验证的 NocoBase 能力

- `PostDesktoproutes_createv2`
- `PostFlowmodels_schemabundle`
- `PostFlowmodels_schemas`
- `GetFlowmodels_findone`
- `PostFlowmodels_save` 或 `PostFlowmodels_mutate`
- `FilterFormBlockModel`
- `TableBlockModel`
- `CreateFormModel`
- `EditFormModel`
- 通过运行时动作体系触发 `openView`

## 当前预期

这是主干可用性用例，应该尽量跑通。即便弹窗动作配置不完整，也至少应该能把页面壳、筛选区块、订单表格和表单区块主体稳定建出来。

## 复盘关注点

- skill 是否还需要多次试探才能确定表格和表单的完整 tree 结构
- 关系字段如客户名称是否需要额外探测才能稳定落到表格里
- 弹窗动作是否仍然过于依赖手工拼接参数
