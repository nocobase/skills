# `addblock`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_addblock`

## 用途

向现有 target 精确追加一个 block。

## 高频参数

- `target`
- `type`
- `resourceInit`
- `props`
- `decoratorProps`
- `settings`
- `stepParams`

## 规则

- 追加前先 `catalog(target)`。
- `type` 必须是公开 block key。
- 对 collection block，通常必须给 `dataSourceKey + collectionName`。
- 默认可创建 block 见能力矩阵；`form` 仅兼容使用，`map/comments` 不要默认创建。
- 优先用 `settings` 走公开改配语义；只有 contract 已明确时才直接写 `stepParams`。
