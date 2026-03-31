# `addblocks`

目标公开 tool：

- `mcp__nocobase__PostFlowsurfaces_addblocks`

如果当前会话没有这个 tool，退化为顺序调用 `addblock`。

## 用途

在同一 target 下顺序批量追加多个 block。

## 语义

- 同一 target
- 顺序执行
- 部分成功

## 规则

- 每个 item 不要自带 `target`。
- 批量写完后必须 `get`。
