# `updatesettings`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_updatesettings`

## 用途

按 contract 允许的 domain/path 精确写入：

- `props`
- `decoratorProps`
- `stepParams`
- `flowRegistry`

## 使用前提

- 必须先 `catalog(target)`。
- 只写 `settingsContract` 允许的 group/path。

## 典型场景

- `openView`
- popup 细项
- `linkageRules.value`
- 不被 `configure` 覆盖的 table/form/action path

## 风险点

- 写错 group/path 会直接失败。
- 如果还绑定着旧 `flowRegistry`，清空相关设置时可能失败。
