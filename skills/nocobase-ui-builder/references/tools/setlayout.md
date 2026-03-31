# `setlayout`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_setlayout`

## 用途

全量写入 grid 布局。

## 关键参数

- `rows`
- `sizes`
- `rowOrder`

## 前提

- target 必须能解析到支持 layout 的 grid 节点。
- 先 `get` 确认有哪些 child uid。

## 规则

- `setlayout` 是全量布局，不是增量 patch。
- child 覆盖必须完整且唯一，否则会失败。
