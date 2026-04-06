# Tool Shapes

当 family、locator 与 target uid 都已经确定，只差“这个 MCP 请求怎么包”时，读本文。family / locator 先看 [runtime-playbook.md](./runtime-playbook.md)，`settings` 的公开语义规则看 [settings.md](./settings.md)，popup 与 `currentRecord` 语义看 [popup.md](./popup.md)，写后核对看 [verification.md](./verification.md)。

## 目录

1. 一屏硬规则
2. 根级 locator `get`
3. `requestBody` 但不带 `target`
4. target-based `requestBody.target.uid`
5. `context` canonical payload
6. `setLayout` canonical payload
7. `apply` / `mutate`
8. 常见错误形状

## 一屏硬规则

- `flow_surfaces_get` 只接受 `uid`、`pageSchemaUid`、`tabSchemaUid`、`routeId`
- `get` 不接受 `requestBody`，也不接受 `target`
- family / locator 没确定前，不要直接拼 payload，先回 [runtime-playbook.md](./runtime-playbook.md)
- 除 `pageSchemaUid/tabSchemaUid/routeId` 外，其他 id 读取时都默认写进 `uid`
- 大多数写接口都要包 `requestBody`；其中很多再在 `requestBody` 内放 `target.uid`
- `createMenu`、`updateMenu`、`createPage` 都是 lifecycle API，不接受 `target`
- `createPage(menuRouteId=...)` 是推荐入口；`createPage` 不传 `menuRouteId` 只在用户明确接受 standalone / compat page 副作用时允许
- 在当前实现中，`tabSchemaUid` 既可作为 `outer-tab` 的 `get` locator，也可直接作为其写 target uid；但 `pageSchemaUid`、`routeId` 仍然只是 `get` locator
- `setLayout` 与 `setEventFlows` 是 high-impact full-replace API；先读完整当前状态，再决定是否写入
- 只要 opener payload 同时要创建 popup subtree，默认显式写 `popup.mode: "append"`；只有用户明确要求整体替换 popup 内容时才写 `replace`
- popup 内 block 的语义资源绑定统一走对象型 `resource`；`currentRecord` / `associatedRecords` 不是字符串速记

## 根级 locator `get`

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

## `requestBody` 但不带 `target`

这类工具都有 `requestBody`，但不接受 `requestBody.target.uid`：

| 语义名 | MCP tool | 关键字段 |
| --- | --- | --- |
| `createMenu` | `flow_surfaces_create_menu` | `requestBody.title`，可选 `type/icon/tooltip/hideInMenu/parentMenuRouteId` |
| `updateMenu` | `flow_surfaces_update_menu` | `requestBody.menuRouteId`，可选 `title/icon/tooltip/hideInMenu/parentMenuRouteId` |
| `createPage` | `flow_surfaces_create_page` | 推荐传 `requestBody.menuRouteId`；其余常用 `title/tabTitle/enableTabs` |
| `destroyPage` | `flow_surfaces_destroy_page` | `requestBody.uid`，必须是 `pageUid` |
| `moveTab` | `flow_surfaces_move_tab` | `requestBody.sourceUid/targetUid/position`；outer tab 直接用 `tabSchemaUid` |
| `removeTab` | `flow_surfaces_remove_tab` | `requestBody.uid`；outer tab 直接用 `tabSchemaUid` |
| `movePopupTab` | `flow_surfaces_move_popup_tab` | `requestBody.sourceUid/targetUid/position` |
| `moveNode` | `flow_surfaces_move_node` | `requestBody.sourceUid/targetUid/position` |

规则：

- 这些 lifecycle API 都只在 MCP 层包一层 `requestBody`
- `createMenu`、`updateMenu`、`createPage` 都不接受 `target`
- `createMenu(type="group")` 只返回菜单 route 信息，不返回可写页面 target
- `createMenu(type="item")` 可能返回 `pageSchemaUid/pageUid/tabSchemaUid/routeId`，但此时页面仍可能未初始化；不要立刻调用 page/tab lifecycle API
- `createPage(menuRouteId=...)` 会把 bindable 菜单项初始化为真正的 Modern page(v2)
- `createPage` 返回的 `pageUid` 用于 page 级写接口；`pageSchemaUid/tabSchemaUid/routeId` 用于读回；`gridUid` 用于后续内容区搭建

## target-based `requestBody.target.uid`

这类工具都要求：

```json
{
  "requestBody": {
    "target": { "uid": "..." }
  }
}
```

### 常见 target-based 工具分组

- surface 与 lifecycle：`catalog`、`compose`、`configure`、`addTab`、`updateTab`、`addPopupTab`、`updatePopupTab`、`removePopupTab`
- 内容追加：`addBlock` / `addBlocks`、`addField` / `addFields`、`addAction` / `addActions`、`addRecordAction` / `addRecordActions`
- merge-like 配置：`updateSettings`
- high-impact full-replace：`setEventFlows`、`setLayout`
- 精确删除：`removeNode`
- 兜底高级入口：`apply`

### 常见 target 选择

- `addTab.target.uid = pageUid`
- `updateTab.target.uid = tabSchemaUid`
- `addPopupTab.target.uid = popupPageUid`
- `updatePopupTab/removePopupTab.target.uid = popupTabUid`
- route-backed 内容区 `catalog/compose/add*` 优先 `target.uid = gridUid`
- popup 内容区 `catalog/compose/add*` 优先 `target.uid = popupGridUid`
- outer tab surface `catalog/configure` 用 `target.uid = tabSchemaUid`
- popup tab surface `catalog/configure` 用 `target.uid = popupTabUid`

规则：

- `target` 是业务 payload 的一部分，MCP 层再包一层 `requestBody`
- `settings` 的公开语义 key、何时 `add* + settings`、何时回退 `configure/updateSettings`，统一看 [settings.md](./settings.md)
- `pageSchemaUid`、`routeId` 属于 `get` locator，不要直接塞进 `target.uid`
- `pageUid`、`gridUid`、`tabSchemaUid`、`popupPageUid`、`popupTabUid`、`popupGridUid` 不是可互换的“通用 target uid”
- `currentRecord` 不属于 locator，也不属于 `target.uid`；它属于 popup 内 block 的资源绑定语义，决策流程看 [popup.md](./popup.md)
- `mutate` 不属于这组 top-level `target.uid` 入口；它使用 `requestBody.ops[]`，由各 op 自己决定是否带 `target`

### popup-capable `addRecordAction` 最小形状

在创建 opener 的同时把 popup subtree 一次带上时，使用这种 canonical 形状：

```json
{
  "requestBody": {
    "target": { "uid": "details-block-uid" },
    "type": "view",
    "settings": {
      "title": "详情"
    },
    "popup": {
      "mode": "append",
      "blocks": [
        {
          "key": "current-user-details",
          "type": "details",
          "resource": {
            "binding": "currentRecord"
          },
          "fields": ["nickname", "email"]
        }
      ]
    }
  }
}
```

写后如果返回了 `popupPageUid` / `popupTabUid` / `popupGridUid`，后续写入直接复用，不再重新猜 popup host。

### popup collection block 的 `resource` 最小形状

在 popup 内容区追加关系 collection block 时，`resource` 用语义化对象，不要退回字符串：

```json
{
  "requestBody": {
    "target": { "uid": "popup-grid-uid" },
    "mode": "append",
    "blocks": [
      {
        "key": "roles-table",
        "type": "table",
        "resource": {
          "binding": "associatedRecords",
          "associationField": "roles"
        },
        "fields": ["name", "title"],
        "recordActions": ["view"]
      }
    ]
  }
}
```

## `context` canonical payload

`flow_surfaces_context` 也属于 target-based `requestBody`，但常见会额外带 `path` / `maxDepth`：

```json
{
  "requestBody": {
    "target": { "uid": "popup-grid-uid" },
    "path": "record",
    "maxDepth": 2
  }
}
```

规则：

- `path` 只接受裸路径，例如 `record`、`popup.record`、`item.parentItem.value`
- 不要传 `ctx.record`、`{{ ctx.record }}` 这类模板包裹写法
- 不传 `path` 时表示读取当前 target 下的默认上下文树
- `maxDepth` 只在需要收敛上下文树时才传；拿到足够信息就停

`add* + settings` 的高频模板统一看 [settings.md](./settings.md)；本文只保留 envelope / locator / target / 高风险 payload 形状，不重复展开公开 settings 模板。

## `setLayout` canonical payload

`setLayout` 是 high-impact full-replace 写法；只有在用户明确接受整体替换、且你已经读过当前完整布局状态时才用。它的 `rows` / `sizes` 很容易写错，单独记住这条心智：

- `rows[rowKey]` 表示“这一行有哪些列”
- `rows[rowKey]` 的每个元素又是“该列里有哪些 child uid”
- 所以：**外层数组长度 = 列数 = `sizes[rowKey]` 的长度**

双列、每列一个 child 的正确写法：

```json
{
  "requestBody": {
    "target": { "uid": "grid-uid" },
    "rowOrder": ["row1"],
    "rows": {
      "row1": [["chart-a"], ["chart-b"]]
    },
    "sizes": {
      "row1": [12, 12]
    }
  }
}
```

关键区别：

- `[["chart-a"], ["chart-b"]]` = 两列
- `[["chart-a", "chart-b"]]` = 一列里堆两个 child

因此下面这种写法是错的：

```json
{
  "rows": {
    "row1": [["chart-a", "chart-b"]]
  },
  "sizes": {
    "row1": [12, 12]
  }
}
```

因为它实际只声明了 **1 列**，却给了 **2 个列宽**。

## `apply` / `mutate`

`apply(mode="replace")` 与 replace-style `mutate` 属于 destructive path：只有用户明确要求替换 subtree 时才执行，并在写前说明影响范围。

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
        "opId": "step1",
        "type": "<advanced-op>",
        "values": {}
      },
      {
        "opId": "step2",
        "type": "<advanced-op>",
        "values": {
          "someRef": { "ref": "step1.id" }
        }
      }
    ]
  }
}
```

规则：

- `apply` 只支持 `mode = "replace"`
- `mutate` 默认 `atomic = true`
- `mutate` 的链式引用统一使用 `{ "ref": "<opId>.<path>" }`
- 上面的 `mutate` 片段只示意请求形状与链式引用；不要把它当成普通页面创建或日常小改的推荐做法
- 只有在公开入口无法表达、且你已经完全确认 target / shape / 顺序时，才使用 `apply/mutate`
- `apply(mode="replace")` 与 replace-style `mutate` 默认按 destructive path 处理；先说明影响范围，再做完整 readback

## 常见错误形状

- 给 `get` 传 `requestBody` 或 `target`
- 把 `pageSchemaUid` / `routeId` 错当成 `target.uid`
- lifecycle API 外面漏掉 `requestBody`
- 在 `createMenu(type="item")` 之后、`createPage(menuRouteId=...)` 之前就调用 page/tab lifecycle API
- 把 `currentRecord` 当成裸 locator 或 `target.uid` 传进去
- 把 popup 内 `resource` 写成字符串，例如 `resource: "currentRecord"` 或 `resource: "associatedRecords"`
- 带 `popup` subtree 却省略 `popup.mode`，再把行为寄托给运行时兜底；skill 的 canonical payload 必须显式写 `append` 或 `replace`
- 在 popup collection block 上混用 `resource` 与 `resourceInit`：语义绑定走 `resource` 对象；非 popup 或 raw 资源初始化才走 `resourceInit`
- 把 `settings.props.*`、`settings.decoratorProps.*`、`settings.stepParams.*` 当成 `add*` 的合法输入
- 对已经暴露在 live `configureOptions` 里的高频属性，仍然默认拆成“先 add 再 configure”
- 把双列布局写成 `rows[rowKey] = [[a, b]]`，同时又传 `sizes[rowKey] = [12, 12]`
- `rows[rowKey]` 与 `sizes[rowKey]` 的顶层长度不一致
