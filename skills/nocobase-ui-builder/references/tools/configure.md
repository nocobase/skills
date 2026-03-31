# `configure`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_configure`

## 用途

修改高频简单配置，而不要求调用方知道底层 path。

## 典型场景

- 表格 `pageSize`
- `dataScope`
- `defaultSorting`
- `clickToOpen`
- `openView`
- action 标题/按钮类型
- JS block/action/field 的简化配置

## 规则

- 优先用它做简单改配。
- 如果 `configure` 已覆盖需求，不要过早降级到 `updateSettings`。
- 先 `catalog` 看当前 target 能改什么，再组织 `changes`。
