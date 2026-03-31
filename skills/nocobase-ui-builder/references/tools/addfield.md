# `addfield`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_addfield`

## 用途

向 block、form grid、details、table 等容器精确追加一个字段。

## 高频参数

- `fieldPath`
- `renderer`
- `type`
- `defaultTargetUid`
- `fieldProps`
- `wrapperProps`

## 规则

- 先 `catalog(target)` 确认容器支持的 field 能力。
- `renderer: "js"` 是绑定字段变体。
- `jsColumn` / `jsItem` 是 standalone field type。
- `filterForm` 多目标时要显式给 `defaultTargetUid`。
- `filterForm` 不支持 `renderer: "js"`。
- `list/gridCard` 的绑定 `renderer: "js"` 与 `table/details` 一样属于 display 型 JS 字段。
