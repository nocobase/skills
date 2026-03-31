# `apply`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_apply`

## 用途

以受控 spec 替换当前 subtree。

## 规则

- v1 只支持 `mode="replace"`。
- 调用前应先 `get`，因为 `apply` 的语义就是基于当前树做受控替换。

## 适合场景

- popup subtree 重建
- tab subtree 定向重构
- 明确 spec 的局部整体替换
