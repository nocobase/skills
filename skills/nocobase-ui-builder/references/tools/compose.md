# `compose`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_compose`

## 用途

在已有 page/tab/grid/popup 下，以公开语义组织一批 block、field、action、recordAction 与基础 layout。

## 适合场景

- 一次搭完整页面主体
- 一次搭完整 popup 内容
- `filterForm + table`、`list`、`gridCard`、`createForm`、`details` 等标准搭建
- 同一 tab 下组合静态 block：`markdown`、`iframe`、`chart`、`actionPanel`、`jsBlock`

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
- `form` 只在明确需要兼容 `FormBlockModel` 时使用；默认优先 `createForm` / `editForm`。
- `map/comments` 不应出现在默认 `compose.blocks[]` 里。
