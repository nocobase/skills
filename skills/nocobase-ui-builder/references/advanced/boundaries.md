# Boundaries

这里只补充主链文档之外的高风险边界。基础 locator、request shape、默认流程统一看：

- [../runtime-truth/overview.md](../runtime-truth/overview.md)
- [../runtime-truth/tool-shapes.md](../runtime-truth/tool-shapes.md)

## 高级决策边界

- block 选型不确定时，先收敛到用户的展示/交互目标，再用 `catalog.blocks` 验证。
- 高级配置不确定时，先看 `configureOptions`；只有公开配置不够时，才查 `catalog.settingsContract` 再决定是否用 `updateSettings`。
- 事件流不确定时，先确认相关 step 是否还存在。
- JS 字段能力冲突时，先看现场 `catalog.fields` 和实际可写 contract，再决定是否暴露。

## 多目标筛选边界

- `filterForm` 同页如果有多个目标，字段必须显式绑定当前 contract 暴露的 target 绑定字段，优先 `defaultTargetUid`。
- `chart` 不应被当成默认 filter target；只有现场读回已确认它带可解析的 target resource 时，才把它算进可筛选目标集合。
- 删除、移动或替换目标 block 后，要重新 `get` / `catalog`，不要假设旧的 filter target 仍然有效。

## Popup / OpenView / Event Flow 边界

- popup surface 与顶层 page/tab 不是同一个作用域；如果只有宿主 uid，先 `get({ uid: hostUid })` 读回 popup 相关 uid，再继续 target-based 写入。
- 先写 popup / openView 相关 settings，再绑定引用它们的 `setEventFlows`。
- 如果 popup settings 被清空，但相关 flow 仍引用旧 path，优先修正 settings 或 flow 引用，不要强行猜测兼容路径。

## `apply` / `mutate` 边界

- `apply` 只接受 `catalog` 或主链文档已公开、且有稳定 contract 的 `type/use`；不接受未公开 model use 或任意 raw subtree patch。
- `apply` 遇到同层 same-use sibling 时，如果 current/desired 能按持久化顺序确定性配对，可以继续；只有无法安全配对时才必须先收敛唯一 target。
- `mutate` 只在确实需要跨多步原子化编排时使用。

## JS 与非默认创建能力边界

- JS 相关能力总览看 [../capabilities/js.md](../capabilities/js.md)。
- `map/comments` 等非默认创建能力的策略统一看 [../runtime-truth/capability-matrix.md](../runtime-truth/capability-matrix.md)。
