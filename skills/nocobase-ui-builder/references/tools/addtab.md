# `addtab`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_addtab`

## 用途

在现有 page 下增加 route-backed tab。

## 高频参数

- `target.pageSchemaUid` 或 `target.uid`
- `title`
- `icon`
- `documentTitle`
- `flowRegistry`

## 关键返回

- `tabSchemaUid`
- `tabRouteId`
- `gridUid`

新增 tab 后，先 `catalog` 或 `get`，再往这个 tab 里 `compose`。
