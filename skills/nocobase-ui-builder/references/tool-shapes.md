# Tool Shapes

只要 request shape 传错，再正确的业务判断也会失败。本文档是 flow surfaces 请求形状的主参考文档；字段合法性始终以 live MCP tool schema 为准。surface family 分流和 uid / locator 词汇表看 [runtime-playbook.md](./runtime-playbook.md)，写后验证看 [readback.md](./readback.md)。

如果 family、locator、target uid 都已经确定，只差“这个 MCP 请求到底怎么包”，先看这里。

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
- `createMenu`、`updateMenu`、`createPage` 都是 lifecycle API，不接受 `target`
- `createPage(menuRouteId=...)` 是推荐入口；`createPage` 不传 `menuRouteId` 只作为兼容 fallback
- 在当前实现中，`tabSchemaUid` 既可作为 `outer-tab` 的 `get` locator，也可直接作为其写 target uid；但 `pageSchemaUid`、`routeId` 仍然只是 `get` locator

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
- `hostUid`、`pageUid`、`gridUid`、`popupPageUid`、`popupTabUid`、`popupGridUid` 这类值，读取时都默认填进 `uid`
- popup 场景下如果现场只暴露 `tabUid` 或 `gridUid`，也按 `uid` 处理

## 2. `requestBody` 但不带 `target`

这类工具都有 `requestBody`，但不接受 `requestBody.target.uid`：

| 语义名 | MCP tool | 关键字段 |
| --- | --- | --- |
| `createMenu` | `mcp__nocobase__flow_surfaces_create_menu` | `requestBody.title`，可选 `requestBody.type/icon/tooltip/hideInMenu/parentMenuRouteId` |
| `updateMenu` | `mcp__nocobase__flow_surfaces_update_menu` | `requestBody.menuRouteId`，可选 `requestBody.title/icon/tooltip/hideInMenu/parentMenuRouteId` |
| `createPage` | `mcp__nocobase__flow_surfaces_create_page` | 推荐传 `requestBody.menuRouteId`；其余常用 `requestBody.title/tabTitle/enableTabs` |
| `destroyPage` | `mcp__nocobase__flow_surfaces_destroy_page` | `requestBody.uid`，必须是 `pageUid` |
| `moveTab` | `mcp__nocobase__flow_surfaces_move_tab` | `requestBody.sourceUid/targetUid/position`，outer tab 直接用 `tabSchemaUid` |
| `removeTab` | `mcp__nocobase__flow_surfaces_remove_tab` | `requestBody.uid`，outer tab 直接用 `tabSchemaUid` |
| `movePopupTab` | `mcp__nocobase__flow_surfaces_move_popup_tab` | `requestBody.sourceUid/targetUid/position` |
| `moveNode` | `mcp__nocobase__flow_surfaces_move_node` | `requestBody.sourceUid/targetUid/position` |

`createMenu(type="group")` 示例：

```json
{
  "requestBody": {
    "title": "Workspace",
    "type": "group"
  }
}
```

`createMenu(type="item")` 示例：

```json
{
  "requestBody": {
    "title": "Employees",
    "type": "item",
    "parentMenuRouteId": 1001
  }
}
```

`createPage(menuRouteId=...)` 示例：

```json
{
  "requestBody": {
    "menuRouteId": 1002,
    "tabTitle": "Overview"
  }
}
```

`updateMenu` 示例：

```json
{
  "requestBody": {
    "menuRouteId": 1002,
    "title": "Employees Center",
    "parentMenuRouteId": 1001
  }
}
```

规则：

- 这些 lifecycle API 都只在 MCP 层包一层 `requestBody`
- `createMenu`、`updateMenu`、`createPage` 都不接受 `target`
- `createMenu(type="group")` 只返回菜单 route 信息，不返回可写页面 target
- `createMenu(type="item")` 会返回 `pageSchemaUid/pageUid/tabSchemaUid/tabRouteId`，但此时页面仍可能未初始化；不要立刻调用 page/tab lifecycle API
- `createPage(menuRouteId=...)` 会把 bindable 菜单项初始化为真正的 Modern page(v2)
- `createPage` 不传 `menuRouteId` 仍可用，但如果后续还要把页面挂到某个菜单下，应该再调用 `updateMenu`
- `createPage` 返回的 `pageUid` 用于 page 级写接口；`pageSchemaUid/tabSchemaUid/routeId` 用于读回；`gridUid` 用于后续内容区搭建
- `createMenu` 或 `createPage` 返回的 `routeId`，在菜单语义里也可直接作为 `menuRouteId`
- 在当前实现中，`outer-tab` 的 lifecycle API 直接使用 `tabSchemaUid`；如果现场 schema 明确不同，以现场为准

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
- `mcp__nocobase__flow_surfaces_mutate`

常见 target 选择：

- `addTab.target.uid = pageUid`
- `updateTab.target.uid = tabSchemaUid`
- `addPopupTab.target.uid = popupPageUid`
- `updatePopupTab/removePopupTab.target.uid = popupTabUid`；popup 场景下如果现场只暴露 `tabUid`，用该值代替
- route-backed 内容区 `catalog/compose/add*` 优先 `target.uid = gridUid`
- popup 内容区 `catalog/compose/add*` 优先 `target.uid = popupGridUid`；popup 场景下如果现场只暴露 `gridUid`，用该值代替
- outer tab surface `catalog/configure` 用 `target.uid = tabSchemaUid`
- popup tab surface `catalog/configure` 用 `target.uid = popupTabUid`；popup 场景下如果现场只暴露 `tabUid`，用该值代替

规则：

- `target` 是业务 payload 的一部分，MCP 层再包一层 `requestBody`
- `pageSchemaUid`、`routeId` 属于 `get` locator，不要直接塞进 `target.uid`
- 在当前实现中，`tabSchemaUid` 可直接放进 outer tab 写接口的 `target.uid`
- `pageUid`、`gridUid`、`tabSchemaUid`、`popupPageUid`、`popupTabUid`、`popupGridUid` 不是可互换的“通用 target uid”
- `currentRecord` 这类 popup 资源语义不属于 locator，也不属于 `target.uid`；它属于 popup 内 block 的资源绑定语义
- 只有在 live `catalog.blocks[].resourceBindings` 明确暴露 `currentRecord` 时，record popup 才默认按“当前记录”语义继续写入
- 普通 popup 不要臆造 `currentRecord`；无法确认时停止写入
- `details(currentRecord)` / `editForm(currentRecord)` 的决策流程统一看 [popup-and-event-flow.md](./popup-and-event-flow.md) 与 [record-popup-recipes.md](./record-popup-recipes.md)
- 由于 block `resource` 的公开写法以 live tool schema 为准，本文不提供 `currentRecord` 的 raw JSON 示例，避免 schema 漂移；真正提交 payload 时只按 live schema 组装

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
    "atomic": true,
    "ops": [
      {
        "opId": "menu",
        "type": "createMenu",
        "values": {
          "title": "Employees",
          "type": "item"
        }
      },
      {
        "opId": "page",
        "type": "createPage",
        "values": {
          "menuRouteId": {
            "$ref": "menu.routeId"
          },
          "tabTitle": "Overview"
        }
      }
    ]
  }
}
```

规则：

- `apply` 默认只做受控 subtree 替换
- `mutate` 默认显式传 `requestBody.target.uid`，除非整段编排完全由 `$ref` 和内部 op 结果自洽
- 菜单优先的新建页面链路，优先编排成 `createMenu -> createPage`
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
    "target": { "uid": "employees-page-uid" },
    "tabTitle": "Overview"
  }
}
```

这不是合法的 `createPage` 形状。正确写法：

```json
{
  "requestBody": {
    "menuRouteId": 1002,
    "tabTitle": "Overview"
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
