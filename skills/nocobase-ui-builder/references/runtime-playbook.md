# Runtime Playbook

本文档是 target family 判别、write target / read locator 角色，以及默认写流程的主参考文档。live MCP tool schema 与现场 `get/catalog/readback` 优先于本文；请求形状看 [tool-shapes.md](./tool-shapes.md)，写后验证看 [readback.md](./readback.md)，只读检查看 [inspect.md](./inspect.md)。

如果你已经知道用户要“创建/修改/重排什么”，但还不确定它属于哪个 family、该读哪个 locator、该把哪个 uid 放进写接口，先看这里。

## UID / Locator Glossary

| 名称 | 角色 | 放在哪里 | 典型来源 |
| --- | --- | --- | --- |
| `menuRouteId` | 菜单节点主键；用于 `createPage(menuRouteId=...)` 与 `updateMenu(menuRouteId=...)` | lifecycle `requestBody` 字段 | `createMenu` / `createPage` 返回值，或菜单树发现结果 |
| `parentMenuRouteId` | 目标父菜单 `group` 的主键 | `createMenu` / `updateMenu` 的 `requestBody` 字段 | 菜单树发现结果 |
| `uid` | 通用节点读定位符；普通节点写 target 也直接用它 | `get` 根级 locator；或 `target.uid` / root `uid` | 已知 block / field / action / wrapper / host uid，或 `get` 读回树里的任意节点 uid |
| `pageSchemaUid` | route-backed page 的读定位符 | `get` 根级 locator | `createPage` 返回值；page route / readback |
| `tabSchemaUid` | route-backed outer tab 的 canonical 标识；在当前实现中既是读 locator，也是 outer-tab 写 target uid | `get` 根级 locator；或 `target.uid` / root `uid` | `createPage` / `addTab` 返回值；tab route / readback |
| `routeId` | 已初始化 `flowPage` 菜单项或 outer tab 的读定位符 | `get` 根级 locator | `createPage` / `addTab` 返回值；路由读回 |
| `pageUid` | route-backed page 的写 target uid | `target.uid` 或 root `uid` | `createPage` 返回值；先 `get(pageSchemaUid/routeId)` 后再取页面节点 uid |
| `gridUid` | `route-content` 的写 target uid | 通常放 `target.uid`；读取时放 `get({ uid })` | `createPage` / `addTab` 返回值 |
| `hostUid` | popup host 节点的读定位符，不是 popup page 本身 | `get({ uid: hostUid })` | 会打开 popup 的 action / field / block uid |
| `popupPageUid` | popup page 的写 target uid | `target.uid` 或 `get({ uid })` | popup-capable action / record action 返回值；从 host `get` 后读 `tree.subModels.page.uid` |
| `popupTabUid` | `popup-tab` 的默认写 target uid | `target.uid` 或 `get({ uid })` | popup-capable action 返回值；popup subtree 读回 |
| `popupGridUid` | `popup-content` 的默认写 target uid | `target.uid` 或 `get({ uid })` | popup-capable action 返回值；popup subtree 读回 |
| `new target` | 当前执行链里刚由写接口直接返回、允许跳过一次前置 `get` 的下一个写 target | 不是 payload 字段，是执行态概念 | `createPage` / `addTab` / popup-capable action / `addPopupTab` 等直接返回值 |

兼容别名：

- popup 场景里如果现场只暴露 `tabUid`，按 `popupTabUid` 处理。
- popup 场景里如果现场只暴露 `gridUid`，按 `popupGridUid` 处理，不要和 `route-content` 的 `gridUid` 混用。
- 菜单 discovery 结果里的 `routeId`，在菜单语义里通常就拿来当 `menuRouteId` / `parentMenuRouteId`。

## Surface Families

| 家族 | 语义 | 默认 write target uid | 首选 read locator | 常见用途 |
| --- | --- | --- | --- | --- |
| `menu-group` | 仅用于组织 Modern page(v2) 的 `group` 菜单 | 不适用；统一走 `createMenu/updateMenu` | 菜单树读回；必要时仅保留 `routeId` | 创建分组、挂接子菜单、重命名分组 |
| `menu-item` | 可绑定 Modern page(v2) 的 `flowPage` 菜单项；在 `createPage` 前属于未初始化页面 | 不适用；初始化与菜单移动统一走 lifecycle API | `menuRouteId` / `routeId`；必要时 `pageSchemaUid` | 初始化页面、重命名菜单、移动到另一分组 |
| `page` | route-backed 顶层页面 | `pageUid` | `pageSchemaUid`，必要时 `routeId` | `addTab`、`destroyPage`、整页读回 |
| `outer-tab` | 页面下的 route-backed tab | `tabSchemaUid` | `tabSchemaUid` | outer tab lifecycle、tab surface `catalog/configure` |
| `route-content` | page / outer tab 内继续搭内容的 grid target | `gridUid` | `uid = gridUid` | `catalog/compose/add*` |
| `popup-page` | 宿主 action / field 打开的 popup 容器 | `popupPageUid` | `uid = popupPageUid` | `addPopupTab`、popup page `catalog/configure` |
| `popup-tab` | popup 内部 tab | `popupTabUid` | `uid = popupTabUid` | popup child tab lifecycle、popup tab `catalog/configure` |
| `popup-content` | popup page / popup child tab 内的内容 grid | `popupGridUid` | `uid = popupGridUid` | popup 内继续 `compose/add*` |
| `node` | 非 lifecycle 节点，例如 block / field / action / wrapper / popup host | 节点自身 `uid` | `uid = node uid` | 精确改配、局部读回、popup host 节点继续写入 |

说明：

- `默认 write target uid` 指写接口里通常应该放进 `target.uid`，或 lifecycle request body 应该使用的主 uid。
- `首选 read locator` 指读回前后优先采用的定位方式；具体 envelope 仍以 [tool-shapes.md](./tool-shapes.md) 和 live MCP tool schema 为准。
- `menu-group` 没有对应的 flow tree，不要把它当成普通 `get -> tree -> nodeMap` surface。
- `menu-item` 在 `createPage(menuRouteId=...)` 之前只有 bindable route shell；此时只允许 `createPage` / `updateMenu`，不允许 page/tab lifecycle API。
- 在当前实现中，`tabSchemaUid` 既是 `outer-tab` 的读 locator，也是其写 target uid；如果现场 schema / readback 明确不同，以现场为准。

## `outer-tab` 与 `popup-tab` 的判别

- 如果 `get(...).tree.use = RootPageTabModel`，这是 `outer-tab`。
- 如果 `get(...).tree.use = ChildPageTabModel`，这是 `popup-tab`。
- 如果 uid 直接来自 `createPage` / `addTab` 返回的 `tabSchemaUid`，按 `outer-tab` 处理。
- 如果 uid 直接来自 `addPopupTab` 或 popup subtree 读回返回的 popup tab uid，按 `popup-tab` 处理。
- 只看到 `kind = "tab"` 不足以选 API；必须先确认 `tree.use` 或 uid 来源。

## 默认写流程

### 1. 先按菜单标题发现父菜单

- `desktop_routes_list_accessible(tree=true)`
- 只接受唯一命中的 `group`
- 命中不唯一或没有命中时停止猜测

### 2. 新建菜单分组

- `createMenu(type="group")`
- 如需继续在该分组下建页面，复用返回的 `routeId` 作为 `parentMenuRouteId`

### 3. 新建完整页面

- 如有父菜单：先解析 `parentMenuRouteId`
- `createMenu(type="item", parentMenuRouteId=...)`
- `createPage(menuRouteId=routeId)`
- 如果继续搭 `route-content`：对返回的 `gridUid` 走 `catalog -> compose / add* / configure -> readback`
- 如果只改 `outer-tab` 元信息：对返回的 `tabSchemaUid` 走 `catalog -> configure -> readback`

### 4. 兼容模式下先建页面再移入菜单

- `createPage`（不传 `menuRouteId`）
- 若用户还要求挂进某个菜单：再执行 `updateMenu(menuRouteId=routeId, parentMenuRouteId=...)`
- 之后再继续 `catalog -> write -> readback`

### 5. 已有 `page` 新增 `outer-tab`

- 先读回 `page`，拿到 `pageUid`
- `addTab(target.uid = pageUid)`
- 对返回的 `gridUid` 或 `tabSchemaUid` 再继续 `catalog -> write -> readback`

### 6. 已有 target 小改或精确追加

- `get -> catalog -> compose / configure / add* / updateSettings / setLayout / setEventFlows / apply / mutate -> readback`

### 7. 已有 popup subtree 写入

- 如果当前执行链没有直接拿到 popup 相关 uid，先从 `hostUid` 这个 popup host，或 `popupPageUid` 读回 popup subtree
- 先明确本次目标到底是 `popup-page`、`popup-tab`，还是 `popup-content`
- 如果 popup uid 来自刚创建的 `recordActions.view/edit/popup`，不要在 action 创建后停下；继续对 `popupGridUid` 执行 `catalog -> write -> readback`
- record popup 的 `currentRecord` guard 统一看 [popup-and-event-flow.md](./popup-and-event-flow.md)；只有 guard 通过时才继续搭 `details/editForm`
- 再对对应 target 执行 `catalog -> write -> readback`

### 8. `inspect`

- `inspect` 的 canonical 流程与断言统一看 [inspect.md](./inspect.md)。
- 本文只保留最小分流心智：菜单层优先菜单树；已初始化 surface 默认 `get`；只有需要 capability / contract 判别时才 `catalog`。
