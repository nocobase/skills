# `updatetab`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_updatetab`

## 用途

修改 tab 标题、图标、documentTitle、tab 级 `flowRegistry`。

## 高频参数

- `tabSchemaUid` 或 `target`
- `title`
- `icon`
- `documentTitle`
- `flowRegistry`

## 规则

- tab 的 `flowRegistry` 会同步回 route state 和 synthetic tab 读回。
- 修改 tab 元信息时，优先 `updatetab`，不要先想 `updateSettings`。
