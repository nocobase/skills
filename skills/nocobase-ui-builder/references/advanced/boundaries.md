# Boundaries

这里只补充高级边界。基础 locator、`target.uid` 和默认流程统一看：

- [../runtime-truth/overview.md](../runtime-truth/overview.md)
- [../runtime-truth/tool-shapes.md](../runtime-truth/tool-shapes.md)

## 高级决策边界

- block 选型不确定时，先收敛到用户的展示/交互目标，再用 `catalog.blocks` 验证。
- 高级配置不确定时，先看 `configureOptions`；只有公开配置不够时，才查 `catalog.settingsContract` 再决定是否用 `updateSettings`。
- 事件流不确定时，先确认相关 step 是否还存在。
- JS 字段能力冲突时，先看现场 `catalog.fields` 和实际可写 contract，再决定是否暴露。

## 多目标筛选边界

- `filterForm` 同页如果有多个 `table/details/list/gridCard/map/comments` 目标，字段必须显式绑定当前 contract 暴露的 target 绑定字段，优先 `defaultTargetUid`。
- `chart` 不应被当成默认 filter target；只有现场读回已确认它带可解析的 target resource 时，才把它算进可筛选目标集合。
- 删除、移动或替换目标 block 后，要重新 `get` / `catalog`，不要假设旧的 filter target 仍然有效。

## 数据范围边界

- 如果某个 block 暴露 `dataScope.filter`，这个 `filter` 必须是 FilterGroup。
- 空筛选默认写 `dataScope.filter = null`；`{}` 只当兼容旧形状，不要优先生成。
- 不要直接传 query object。
- 如果配置错误，优先修正输入结构，不要猜测底层 step path。

## Popup / OpenView / Event Flow 边界

- popup surface 与顶层 page/tab 不是同一个作用域；必须先读回 popup uid，再继续 target-based 写入。
- popup child tab 不要混用外层 `addTab/updateTab/moveTab/removeTab`；要走 `addPopupTab/updatePopupTab/movePopupTab/removePopupTab`。
- popup page / popup child tab 都会表现为 page/tab 节点；选 API 时继续看 `tree.use` 和 uid 来源。
- 先写 popup / openView 相关 settings，再绑定引用它们的 `setEventFlows`。
- 如果 popup settings 被清空，但相关 flow 仍引用旧 path，优先修正 settings 或 flow 引用，不要强行猜测兼容路径。

## `apply` / `mutate` 边界

- `apply` 只接受公开 capability 对应的 subtree spec，不接受任意 raw subtree patch。
- `apply` 对合法公开 `use` 是支持的；不要把“出现 raw use”本身误判成非法。
- `apply` 遇到同层 same-use sibling 时，如果 current/desired 能按持久化顺序确定性配对，可以继续；只有无法安全配对时才必须先收敛唯一 target。
- `mutate` 只在确实需要跨多步原子化编排时使用。

## JS 与只读 block 边界

- JS 相关配置优先走 `configure`；只有公开配置不覆盖且 `settingsContract` 已明确时才降级到 `updateSettings`。
- `map/comments` 可能在 `catalog` 和 `get` 中出现，也可能带 settings contract。
- `map/comments` 属于非默认创建能力，不当作 `compose/addBlock` 默认选项。
- 已有 map/comments 可以保守维护；只有用户明确要求且现场 `catalog` 暴露创建能力时，才继续创建 map/comments。
