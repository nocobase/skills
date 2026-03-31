# `removenode`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_removenode`

## 用途

删除指定节点及其 subtree。

## 规则

- 删除 block/field/action 前先 `get` 确认 target。
- 删除 filterForm 相关节点时，要特别注意 target 绑定副作用是否同步移除。
