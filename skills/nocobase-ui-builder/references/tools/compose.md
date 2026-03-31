# `compose`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_compose`

## 用途

在已有 page/tab/grid/popup 下，以公开语义组织一批 block、field、action、recordAction 与基础 layout。

## 适合场景

- 一次搭完整页面主体
- 一次搭完整 popup 内容
- `filterForm + table`、`list`、`gridCard` 等标准搭建

## 高频参数

- `target`
- `mode`
- `blocks`
- `layout`

## 规则

- 默认 `mode="append"`。
- `compose` 的 `actions` 是 block 级动作。
- `compose` 的 `recordActions` 只对 `table/details/list/gridCard` 有意义。
- `compose` 只接受公开语义字段，不要混入 raw `use/stepParams/flowRegistry`。
