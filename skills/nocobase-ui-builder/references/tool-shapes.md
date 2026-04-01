# Tool Shapes

只要 request shape 传错，再正确的业务判断也会失败。本文件是 flow surfaces 请求形状的唯一 owner。

## 目录

1. 根级 locator `get`
2. `requestBody` 但不带 `target`
3. target-based `requestBody.target.uid`
4. `apply` / `mutate`
5. 常见错误形状

## 一屏硬规则

- `flow_surfaces_get` 只接受 `uid`、`pageSchemaUid`、`tabSchemaUid`、`routeId`
- `get` 不接受 `requestBody`，也不接受 `target`
- 除 `pageSchemaUid/tabSchemaUid/routeId` 外，其他 id 读取时都默认写进 `uid`
- 大多数写接口都要包 `requestBody`；其中很多再在 `requestBody` 内放 `target.uid`

## 1. 根级 locator `get`

对应 MCP tool：`mcp__nocobase__flow_surfaces_get`

合法示例：

```json
{ "uid": "table-block-uid" }
```

```json
{ "pageSchemaUid": "employees-page-schema" }
```

```json
{ "tabSchemaUid": "overview-tab-schema" }
```

```json
{ "routeId": "123" }
```

规则：

- 只接受根级定位字段
- 不接受 `requestBody`
- 不接受 `target`
- 一次只传一个 root locator
- `hostUid`、`pageUid`、`popupPageUid`、`popupTabUid`、`tabUid`、`gridUid`、`popupGridUid` 这类值，读取时都默认填进 `uid`

## 2. `requestBody` 但不带 `target`

这类工具都有 `requestBody`，但不接受 `requestBody.target.uid`：

| 语义名 | MCP tool | 关键字段 |
| --- | --- | --- |
| `createPage` | `mcp__nocobase__flow_surfaces_create_page` | `requestBody.title`、`requestBody.tabTitle` |
| `destroyPage` | `mcp__nocobase__flow_surfaces_destroy_page` | `requestBody.uid`，必须是 `pageUid` |
| `moveTab` | `mcp__nocobase__flow_surfaces_move_tab` | `requestBody.sourceUid/targetUid/position` |
| `removeTab` | `mcp__nocobase__flow_surfaces_remove_tab` | `requestBody.uid`，直接用 `tabSchemaUid` |
| `movePopupTab` | `mcp__nocobase__flow_surfaces_move_popup_tab` | `requestBody.sourceUid/targetUid/position` |
| `moveNode` | `mcp__nocobase__flow_surfaces_move_node` | `requestBody.sourceUid/targetUid/position` |

`createPage` 示例：

```json
{
  "requestBody": {
    "title": "Employees",
    "tabTitle": "Overview"
  }
}
```

规则：

- `createPage` 创建 target 本身，所以不接受 `target`
- 只在 MCP 层包一层 `requestBody`
- `createPage` 返回的 `pageUid` 用于 page 级写接口；`pageSchemaUid/tabSchemaUid/routeId` 用于读回；`gridUid` 用于内容区搭建

## 3. target-based `requestBody.target.uid`

这类工具都要求：

```json
{
  "requestBody": {
    "target": { "uid": "..." }
  }
}
```

常见工具：

- `mcp__nocobase__flow_surfaces_catalog`
- `mcp__nocobase__flow_surfaces_compose`
- `mcp__nocobase__flow_surfaces_configure`
- `mcp__nocobase__flow_surfaces_add_tab`
- `mcp__nocobase__flow_surfaces_update_tab`
- `mcp__nocobase__flow_surfaces_add_popup_tab`
- `mcp__nocobase__flow_surfaces_update_popup_tab`
- `mcp__nocobase__flow_surfaces_remove_popup_tab`
- `mcp__nocobase__flow_surfaces_add_block` / `add_blocks`
- `mcp__nocobase__flow_surfaces_add_field` / `add_fields`
- `mcp__nocobase__flow_surfaces_add_action` / `add_actions`
- `mcp__nocobase__flow_surfaces_add_record_action` / `add_record_actions`
- `mcp__nocobase__flow_surfaces_update_settings`
- `mcp__nocobase__flow_surfaces_set_event_flows`
- `mcp__nocobase__flow_surfaces_set_layout`
- `mcp__nocobase__flow_surfaces_remove_node`
- `mcp__nocobase__flow_surfaces_apply`

常见 target 选择：

- `addTab.target.uid = pageUid`
- `updateTab.target.uid = tabSchemaUid`
- `addPopupTab.target.uid = popupPageUid`
- `updatePopupTab/removePopupTab.target.uid = popupTabUid/tabUid`
- route-backed 内容区 `catalog/compose/add*` 优先 `target.uid = gridUid`
- popup 内容区 `catalog/compose/add*` 优先 `target.uid = popupGridUid/gridUid`
- outer tab surface `catalog/configure` 用 `target.uid = tabSchemaUid`
- popup tab surface `catalog/configure` 用 `target.uid = popupTabUid/tabUid`

规则：

- `target` 是业务 payload 的一部分，MCP 层再包一层 `requestBody`
- `pageSchemaUid`、`routeId` 属于 `get` locator，不要直接塞进 `target.uid`
- `pageUid`、`gridUid`、`tabSchemaUid`、`popupPageUid`、`popupTabUid`、`popupGridUid` 不是可互换的“通用 target uid”

## 4. `apply` / `mutate`

`mcp__nocobase__flow_surfaces_apply`

```json
{
  "requestBody": {
    "target": { "uid": "table-block-uid" },
    "mode": "replace",
    "spec": { "subModels": {} }
  }
}
```

`mcp__nocobase__flow_surfaces_mutate`

```json
{
  "requestBody": {
    "target": { "uid": "table-block-uid" },
    "atomic": true,
    "ops": ["..."]
  }
}
```

规则：

- `apply` 默认只做受控 subtree 替换
- `mutate` 默认显式传 `requestBody.target.uid`，除非整段编排完全由 `$ref` 和内部 op 结果自洽
- `mutate` 是编排工具，不是默认 patch 工具

## 5. 常见错误形状

错误：

```json
{
  "requestBody": {
    "target": { "uid": "table-uid" }
  }
}
```

这是错误的 `get` 形状。正确写法：

```json
{ "uid": "table-uid" }
```

错误：

```json
{
  "requestBody": {
    "target": {
      "pageSchemaUid": "employees-page-schema"
    },
    "title": "Stats"
  }
}
```

这不是合法的 `addTab` 形状。正确写法：

```json
{
  "requestBody": {
    "target": { "uid": "employees-page-uid" },
    "title": "Stats"
  }
}
```

错误：

```json
{
  "requestBody": {
    "uid": "popup-tab-uid"
  }
}
```

这不是合法的 `removePopupTab` 形状。正确写法：

```json
{
  "requestBody": {
    "target": { "uid": "popup-tab-uid" }
  }
}
```
