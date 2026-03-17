# Case 3 - 采购单与明细抽屉

## 测试目标

验证主表 + 详情抽屉 + 关系明细子表的组合场景，尤其是弹窗中的关系数据区块是否能稳定挂接。

## 前置数据模型

- `suppliers`: 供应商，字段至少包含 `id`、`name`、`code`
- `purchase_orders`: 采购单，字段至少包含 `id`、`po_no`、`supplier_id`、`status`、`total_amount`
- `purchase_order_items`: 采购单明细，字段至少包含 `id`、`purchase_order_id`、`material_id`、`quantity`、`amount`
- `materials`: 物料，字段至少包含 `id`、`name`、`sku`、`unit`
- 关系：`purchase_orders.belongsTo(suppliers)`
- 关系：`purchase_order_items.belongsTo(purchase_orders)`
- 关系：`purchase_order_items.belongsTo(materials)`

## 前置模拟数据

- `suppliers` 至少 3 条
- `materials` 至少 6 条，包含不同物料编码和单位
- `purchase_orders` 至少 5 条，覆盖 `draft`、`pending`、`approved`、`done` 等状态
- `purchase_order_items` 至少 10 条，且至少 1 张采购单拥有 3 条以上明细
- 至少准备 1 张可通过采购单号精确命中的采购单，并确保其明细完整，便于验证抽屉中的详情和子表

## 测试 Prompt

```text
请使用 nocobase-ui-builder skill 帮我搭建一个“采购单中心”页面，并完整记录工具调用日志，结束后生成复盘报告和改进建议。

页面目标如下：
1. 创建一个采购单列表页面，主表展示采购单号、供应商、状态、总金额。
2. 为采购单表格提供“查看详情”动作，使用抽屉打开采购单详情页。
3. 抽屉中展示采购单详情区块。
4. 抽屉中再展示一个采购明细关系表格，展示物料、数量、金额。
5. 如果当前 skill 或 API 无法把关系表稳定挂到抽屉里，请不要伪造结果，明确记录缺口和下一步建议。

执行要求：
- 先准备并校验前置模拟数据，不要跳过这一步直接验证空页面。
- 必须先探测模型和现有树，再写入。
- 优先尝试一次性提交完整 flow model tree。
- 最终说明里要单独交代采购单和采购明细分别准备了多少条样本数据。
- 最终给我日志路径、报告路径，以及你认为最影响可用性的瓶颈。
```

## 最低验收标准

- 能创建采购单主表页面
- 主表或抽屉中的详情/明细至少能命中一张带完整明细的采购单样本
- 能为主表挂上详情查看动作或至少明确动作配置进展
- 能在说明中清楚表达抽屉内详情区块与关系表格的完成度
- 工具日志和报告产物齐全
- 对失败或阻塞原因有明确记录
- 输出中给出至少一个 API 或 skill 的优化方向

## 重点验证的 NocoBase 能力

- `TableBlockModel`
- `DetailsBlockModel`
- popup/drawer 打开详情页
- 关系明细表格在弹窗页面内的挂接
- `PostFlowmodels_mutate` 在复杂 tree 写入中的适配性

## 当前预期

这是中高难度用例，主表部分应该可完成，抽屉内复杂布局很可能开始暴露当前页面摘要、popup page summary 和关系区块挂载的不足。

## 复盘关注点

- 是否缺少“popup 页面 + 默认 grid”级别的聚合 API
- 抽屉内关系表格是否必须依赖更多运行时上下文
- 复杂 tree 一次性回写时是否缺少更稳的定位协议
