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
- `stepParams`

## 规则

- 追加前先 `catalog(target)`。
- `type` 必须是公开 block key。
- 对 collection block，通常必须给 `dataSourceKey + collectionName`。
