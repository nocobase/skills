# `movenode`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_movenode`

## 用途

调整同一父容器下兄弟节点顺序。

## 规则

- 只支持同一 parent/subKey 下的兄弟节点。
- 先 `get` 拿到 `sourceUid` 与 `targetUid`。
