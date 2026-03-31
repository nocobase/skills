# Boundaries

## 这个 skill 应该做什么

- 根据自然语言映射到 page/tab/block/field/action/layout/configuration
- 用 `catalog/get` 约束生成
- 在 UI 搭建范围内完成可工作的页面

## 这个 skill 不应该做什么

- 不把源码当运行时依赖
- 不把 REST 当运行时接口
- 不把 raw tree patch 当默认手段
- 不把数据建模、ACL、workflow 全量定义混进 UI 搭建
- 不假设每个 block/action/field 都在当前应用里已启用
- 不把 `map/comments` 当成默认创建能力
- 不把 `form` 当成新增页面的默认首选

## 决策边界

- block 选型不确定时，先收敛到用户的展示/交互目标，再用 `catalog.blocks` 验证。
- 高级配置不确定时，先 `catalog.settingsContract`，再决定 `configure` 还是 `updateSettings`。
- 事件流不确定时，先确认相关 step 是否还存在。
- JS 字段能力冲突时，先看现场 `catalog.fields` 和实际可写 contract，再决定是否暴露。

## 多目标筛选边界

- `filterForm` 同页如果有多个 `table/details/list/gridCard/map/comments` 目标，字段必须显式绑定 `defaultTargetUid` 或等价 target 信息。
- `chart` 不应被当成默认 filter target；只有现场读回已确认它带可解析的 target resource 时，才把它算进可筛选目标集合。
- 删除、移动或替换目标 block 后，要重新 `get` / `catalog`，不要假设旧的 filter target 仍然有效。

## 数据范围边界

- `dataScope` 必须是 FilterGroup。
- 空筛选可以用 `null` 或 `{}`，但不要直接传 query object。
- 如果配置错误，优先修正输入结构，不要猜测底层 step path。

## apply / mutate 边界

- `apply` 只接受公开 capability 对应的 subtree spec，不接受任意 raw subtree patch。
- `apply` 对合法公开 `use` 是支持的；不要把“出现 raw use”本身误判成非法。
- `apply` 遇到同层 same-use sibling 时，如果 current/desired 能按持久化顺序确定性配对，可以继续；只有无法安全配对时才必须先收敛唯一 target。
- `mutate` 只在确实需要跨多步原子化编排时使用。

## 读取边界

- `flowSurfaces:get` 只接受根级 locator：`uid`、`pageSchemaUid`、`tabSchemaUid`、`routeId`。
- 不要把 `uid` 再包一层 `target`。
- `target` 是写接口概念，不是 `get` 的请求形状。

## 只读 block 边界

- `map/comments` 可能在 `catalog` 和 `get` 中出现，也可能带 settings contract。
- 当前 skill 只把它们当“已有页面上的保守维护对象”，不当作 `compose/addBlock` 默认选项。
- 如果用户明确要求新建 map/comments，先说明当前 flowSurfaces `createSupported = false`，不要伪造替代能力。
