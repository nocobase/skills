# `apply`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_apply`

## 用途

以受控 spec 替换当前 subtree。

## 规则

- v1 只支持 `mode="replace"`。
- 调用前应先 `get`，因为 `apply` 的语义就是基于当前树做受控替换。
- 可以使用公开 capability 对应的合法 `use` subtree spec，例如 `MarkdownBlockModel`、`JSColumnModel`、`FilterFormItemModel`；但不要塞非公开 model、内部 path，或任意越权 tree patch。
- 遇到同层 same-use sibling 时，先 `get`；如果 current/desired 能按持久化顺序确定性配对，可以继续 `apply`，只有无法安全配对时才应停下并要求更明确定位。

## 适合场景

- popup subtree 重建
- tab subtree 定向重构
- 明确 spec 的局部整体替换
