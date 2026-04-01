# Transaction Semantics

## 单项写入

这些调用默认是单项、精确写入：

- `addBlock`
- `addField`
- `addAction`
- `addRecordAction`
- `updateSettings`
- `setEventFlows`
- `setLayout`
- `moveNode`
- `removeNode`
- `addTab/updateTab/moveTab/removeTab`
- `addPopupTab/updatePopupTab/movePopupTab/removePopupTab`

写入后按变更类型做最小必要读回；page / tab / popup child tab 生命周期变更再做完整 `get` 校验。

## `compose`

- 默认 `mode="append"`。
- 也支持 `mode="replace"`。
- 适合在同一 target 下按公开语义搭建一批 block，并顺带组织 fields/actions/recordActions/layout。
- `compose` 期间会内部复用 `add* + configure + setLayout` 的能力，但对调用者暴露的是更高层语义。

## 批量 `add*`

`addBlocks`、`addFields`、`addActions`、`addRecordActions` 的语义是：

- 同一 target
- 顺序执行
- 部分成功
- 每个 item 不能自带 `target`

因此：

- 用它们时要假设“前几个成功、后几个失败”是可能状态。
- 批量写完后必须 `get`，不要只看返回的 successCount/errorCount。

## `apply`

- v1 只支持 `mode="replace"`。
- 适合“我已经拿到当前树，希望把某个 subtree 替换成明确 spec”的场景。
- `apply` 会先读当前树，再编译为底层 `mutate` 操作。

## `mutate`

- v1 只支持 `atomic=true`。
- 适合多步编排、引用前一步产物 uid、需要事务一致性时使用。
- 不应该把 `mutate` 当作默认入口；只有在高层语义不足时才使用。

## 推荐写入策略

- 单节点高频改配：`configure`
- 一批公开语义内容搭建：`compose`
- 同一 target 顺序增量追加：批量 `add*`
- 明确 contract 的底层 path 修改：`updateSettings`
- 复杂多步重构：`apply` 或 `mutate`
