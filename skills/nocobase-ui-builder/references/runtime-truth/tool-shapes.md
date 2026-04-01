# Tool Shapes

运行时必须区分 4 类基础形状。这里统一使用当前 MCP 实际暴露的 callable tool id；文中的 `get`、`catalog`、`createPage` 等只是语义名。

## 1. 根级 locator 读取

对应 MCP tool：

- `mcp__nocobase__flow_surfaces_get`

调用形状：

```json
{
  "uid": "table-block-uid"
}
```

或者：

```json
{
  "pageSchemaUid": "employees-page-schema"
}
```

规则：

- 只接受根级定位字段。
- 不接受 `requestBody`。
- 不接受 `target` 包装。
- 至少给出一个：`uid`、`pageSchemaUid`、`tabSchemaUid`、`routeId`。

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
- 只在 MCP 层包 `requestBody`。
- 后续读取可使用返回的 `pageSchemaUid`、`tabSchemaUid`、`routeId`。
- page 级写接口用返回的 `pageUid`。
- route-backed tab 级写接口和 outer tab surface target 直接用返回的 `tabSchemaUid`。
- 新页面首次 `catalog/compose` 优先使用返回的 `gridUid` 或 `tabSchemaUid`。

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

规则：

- `target` 是业务 payload 的一部分。
- MCP 层再包一层 `requestBody`。
- `addTab.target.uid` 填 `pageUid`。
- `updateTab.target.uid` 填 route-backed tab 的 `tabSchemaUid`。
- `addPopupTab.target.uid` 填 `popupPageUid` 或读回得到的 `ChildPageModel.uid`。
- `updatePopupTab/removePopupTab.target.uid` 填 popup child tab 的 `popupTabUid` / `tabUid` / `ChildPageTabModel.uid`。
- outer tab 与 popup child tab 都可能表现为 `kind = "tab"`；要结合 `tree.use` 或 uid 来源选对 API。
- `pageSchemaUid`、`routeId` 属于 `get` locator，不要直接塞进 `target.uid`。

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

另一个错误：

```json
{
  "requestBody": {
    "uid": "table-uid",
    "type": "view"
  }
}
```

这里少了 `target`。

正确：

```json
{
  "requestBody": {
    "target": {
      "uid": "table-uid"
    },
    "type": "view"
  }
}
```

还有一个常见错误：

```json
{
  "requestBody": {
    "target": {
      "uid": "employees-page-uid"
    },
    "title": "Employees"
  }
}
```

这不是合法的 `createPage` 形状。

正确：

```json
{
  "requestBody": {
    "title": "Employees",
    "tabTitle": "Overview"
  }
}
```

再一个常见错误：

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

还有一个 popup child tab 的常见错误：

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
