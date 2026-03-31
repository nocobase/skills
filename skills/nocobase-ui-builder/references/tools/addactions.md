# `addactions`

目标公开 tool：

- `mcp__nocobase__PostFlowsurfaces_addactions`

如果当前会话没有这个 tool，退化为顺序调用 `addaction`。

## 用途

在同一 target 下批量追加非 record actions。

## 规则

- 不追加 record action。
- 每个 item 不要自带 `target`。
