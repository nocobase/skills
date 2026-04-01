# Tool Shapes

运行时必须区分 4 类基础形状。这里统一使用当前 MCP 实际暴露的 callable tool id；文中的 `get`、`catalog`、`createPage` 等只是语义名。

## 1. 根级 locator 读取

对应 MCP tool：

- `mcp__nocobase__flow_surfaces_get`

合法调用形状示例：

```json
{
  "uid": "table-block-uid"
}
```

```json
{
  "pageSchemaUid": "employees-page-schema"
}
```

```json
{
  "tabSchemaUid": "overview-tab-schema"
}
```

```json
{
  "routeId": "123"
}
```

规则：

- 只接受根级定位字段。
- 不接受 `requestBody`。
- 不接受 `target` 包装。
- 一次只传一个 root locator；不要混传多个 locator 兜底。
- 只有这 4 个根级 locator：`uid`、`pageSchemaUid`、`tabSchemaUid`、`routeId`。
- 像 `hostUid`、`pageUid`、`popupPageUid`、`popupTabUid`、`tabUid`、`gridUid`、`popupGridUid` 这类值，在读取时默认都填进 `uid`。

## 2. `requestBody` 但不带 `target`

这组工具都有 `requestBody`，但不会使用 `requestBody.target.uid`：

| 人类语义 | MCP tool | 关键字段 | 备注 |
| --- | --- | --- | --- |
| `createPage` | `mcp__nocobase__flow_surfaces_create_page` | `requestBody.title`、`requestBody.tabTitle` | 创建 target 本身 |
| `destroyPage` | `mcp__nocobase__flow_surfaces_destroy_page` | `requestBody.uid` | 这里的 `uid` 必须是 `pageUid` |
| `moveTab` | `mcp__nocobase__flow_surfaces_move_tab` | `requestBody.sourceUid`、`requestBody.targetUid`、`requestBody.position` | 同一 page 下兄弟 tab 排序 |
| `removeTab` | `mcp__nocobase__flow_surfaces_remove_tab` | `requestBody.uid` | 这里的 `uid` 直接用 route-backed tab 的 `tabSchemaUid` |
| `movePopupTab` | `mcp__nocobase__flow_surfaces_move_popup_tab` | `requestBody.sourceUid`、`requestBody.targetUid`、`requestBody.position` | 同一 popup page 下 sibling popup child tab 排序 |
| `moveNode` | `mcp__nocobase__flow_surfaces_move_node` | `requestBody.sourceUid`、`requestBody.targetUid`、`requestBody.position` | 同一 parent/subKey 下兄弟节点排序 |

`createPage` 调用形状：

```json
{
  "requestBody": {
    "title": "Employees",
    "tabTitle": "Overview"
  }
}
```

规则：

- `createPage` 是写接口，但它创建 target 本身，因此不接受 `target`。
- 只在 MCP 层包一层 `requestBody`。
- 后续读取可使用返回的 `pageSchemaUid`、`tabSchemaUid`、`routeId`。
- page 级写接口用返回的 `pageUid`。
- route-backed tab 级写接口和 outer tab surface target 用返回的 `tabSchemaUid`。
- 新页面或新外层 tab 的内容区写入，优先使用返回的 `gridUid`。

## 3. target-based `requestBody.target.uid`

这组工具都要求：

```json
{
  "requestBody": {
    "target": {
      "uid": "..."
    }
  }
}
```

对应 MCP tools：

- `mcp__nocobase__flow_surfaces_catalog`
- `mcp__nocobase__flow_surfaces_compose`
- `mcp__nocobase__flow_surfaces_configure`
- `mcp__nocobase__flow_surfaces_add_tab`
- `mcp__nocobase__flow_surfaces_update_tab`
- `mcp__nocobase__flow_surfaces_add_popup_tab`
- `mcp__nocobase__flow_surfaces_update_popup_tab`
- `mcp__nocobase__flow_surfaces_remove_popup_tab`
- `mcp__nocobase__flow_surfaces_add_block`
- `mcp__nocobase__flow_surfaces_add_blocks`
- `mcp__nocobase__flow_surfaces_add_field`
- `mcp__nocobase__flow_surfaces_add_fields`
- `mcp__nocobase__flow_surfaces_add_action`
- `mcp__nocobase__flow_surfaces_add_actions`
- `mcp__nocobase__flow_surfaces_add_record_action`
- `mcp__nocobase__flow_surfaces_add_record_actions`
- `mcp__nocobase__flow_surfaces_update_settings`
- `mcp__nocobase__flow_surfaces_set_event_flows`
- `mcp__nocobase__flow_surfaces_set_layout`
- `mcp__nocobase__flow_surfaces_remove_node`
- `mcp__nocobase__flow_surfaces_apply`

常见 target 选择：

- `addTab.target.uid = pageUid`
- `updateTab.target.uid = tabSchemaUid`
- `addPopupTab.target.uid = popupPageUid`
- `updatePopupTab/removePopupTab.target.uid = popupTabUid / tabUid`
- route-backed 内容区 `catalog/compose/add*` 优先 `target.uid = gridUid`
- popup 内容区 `catalog/compose/add*` 优先 `target.uid = popupGridUid / gridUid`
- outer tab surface 的 `catalog/configure` 用 `target.uid = tabSchemaUid`
- popup tab surface 的 `catalog/configure` 用 `target.uid = popupTabUid / tabUid`

规则：

- `target` 是业务 payload 的一部分，MCP 层再包一层 `requestBody`。
- outer tab 与 popup child tab 都可能表现为 `kind = "tab"`；要结合 `tree.use` 或 uid 来源选对 API。
- `pageSchemaUid`、`routeId` 属于 `get` locator，不要直接塞进 `target.uid`。
- `pageUid`、`gridUid`、`tabSchemaUid`、`popupPageUid`、`popupTabUid`、`popupGridUid` 都不是“任意 target-based tool 可互换”的通用 uid；按上面的接口族选择。

## 4. `mutate` 的特例

`mcp__nocobase__flow_surfaces_mutate` 的接口允许 `requestBody.target` 可选：

```json
{
  "requestBody": {
    "target": {
      "uid": "table-block-uid"
    },
    "atomic": true,
    "ops": [
      "..."
    ]
  }
}
```

本 skill 默认在 `mutate` 时显式传 `requestBody.target.uid`，除非整段编排已经完全由 `$ref` 和内部 op 结果自洽，不依赖外部 surface 上下文。

## 常见错误形状

错误：

```json
{
  "requestBody": {
    "target": {
      "uid": "table-uid"
    }
  }
}
```

这是错误的 `get` 调用形状。

正确：

```json
{
  "uid": "table-uid"
}
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

这不是合法的 `addTab` 形状。

正确：

```json
{
  "requestBody": {
    "target": {
      "uid": "employees-page-uid"
    },
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

这不是合法的 `removePopupTab` 形状。

正确：

```json
{
  "requestBody": {
    "target": {
      "uid": "popup-tab-uid"
    }
  }
}
```
