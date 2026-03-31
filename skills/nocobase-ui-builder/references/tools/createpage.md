# `createpage`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_createpage`

## 用途

- 创建 route-backed page
- 创建默认 tab route
- 创建 page model 与默认 block grid

## 高频参数

- `title`
- `tabTitle`
- `documentTitle`
- `icon`
- `displayTitle`
- `enableTabs`
- `enableHeader`

## 关键返回

- `pageSchemaUid`
- `tabSchemaUid`
- `gridUid`

后续页面内容编排通常从 `tabSchemaUid` 或 `gridUid` 开始。
