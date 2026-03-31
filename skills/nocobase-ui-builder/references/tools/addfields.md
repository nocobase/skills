# `addfields`

目标公开 tool：

- `mcp__nocobase__PostFlowsurfaces_addfields`

如果当前会话没有这个 tool，退化为顺序调用 `addfield`。

## 用途

在同一 target 下顺序批量追加字段。

## 规则

- 同一 target
- 顺序执行
- 部分成功
- 批量场景也要先 `catalog`
