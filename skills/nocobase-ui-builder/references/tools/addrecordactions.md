# `addrecordactions`

目标公开 tool：

- `mcp__nocobase__PostFlowsurfaces_addrecordactions`

如果当前会话没有这个 tool，退化为顺序调用 `addrecordaction` 或 `compose.recordActions`。

## 用途

在同一 target 下顺序批量追加 record actions。

## 规则

- 只用于记录级动作。
- 批量结果可能部分成功，必须二次 `get`。
