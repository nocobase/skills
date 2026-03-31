# `addrecordaction`

目标公开 tool：

- `mcp__nocobase__PostFlowsurfaces_addrecordaction`

如果当前会话尚未暴露此 tool，但要追加单条 record action，优先在支持的入口上使用等价 record-action 能力，或退化为 `compose.recordActions`。

## 用途

精确追加一个 record action。

## 适用容器

- `table`
- `details`
- `list`
- `gridCard`

## 规则

- 不要把 `view/edit/delete/updateRecord/...` 塞进 `addaction`。
- table 场景下读回时留意 `actionsColumnUid`。
