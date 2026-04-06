# Runtime Playbook

当你已经知道要创建、修改或重排什么，但还不确定它属于哪个 `target family`、该读哪个 locator、该把哪个 uid 放进写接口时，读本文。请求形状看 [tool-shapes.md](./tool-shapes.md)，popup 内容与 `currentRecord` guard 看 [popup.md](./popup.md)，写后核对看 [verification.md](./verification.md)。`catalog` 是否必读，统一看 [normative-contract.md](./normative-contract.md)。

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
| `pre-init ids` | `createMenu(type="item")` 返回、但尚未完成 `createPage(menuRouteId=...)` 初始化的 page / tab / route 相关 id | 只允许继续用于初始化链路；不要直接拿去做 page/tab lifecycle 写入 | `createMenu(type="item")` 返回值 |
| `new target` | 当前执行链里刚由写接口直接返回、允许跳过一次前置 `get` 的下一个写 target | 不是 payload 字段，是执行态概念 | `createPage` / `addTab` / popup-capable action / `addPopupTab` 等直接返回值 |

兼容别名：popup 场景里如果现场只暴露 `tabUid`，按 `popupTabUid` 处理；如果只暴露 `gridUid`，按 `popupGridUid` 处理；菜单 discovery 结果里的 `routeId`，在菜单语义里通常就拿来当 `menuRouteId` / `parentMenuRouteId`。

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

说明：`menu-group` 没有对应的 flow tree，不要把它当成普通 `get -> tree -> nodeMap` surface；`menu-item` 在 `createPage(menuRouteId=...)` 之前只允许 `createPage` / `updateMenu`；`pre-init ids` 在初始化完成前都不是 write-ready target；在当前实现中，`tabSchemaUid` 既是 `outer-tab` 的读 locator，也是其写 target uid，若现场明确不同，以现场为准。

## 标题 / 图标速查矩阵

| 自然语言 | 默认可见位置 | family | 首选 API / 路径 | 备注 |
| --- | --- | --- | --- | --- |
| 菜单标题 / 菜单图标 / 左侧导航图标 | 左侧菜单 | `menu-item` / `menu-group` | `updateMenu` | 如果是 route-backed page，也先改页面入口，不要跳到 tab |
| 页面内容区标题 / 页面顶部标题 / 页头标题 | page header title | `page` | page `configure` | 这是标题文案路径，不等于页面顶部图标路径 |
| 页面顶部图标 / 页头图标 / header icon | page header icon | `page` | 先查渲染链 | 不默认承诺可见效果；只有确认 header 消费 `icon` 后才继续 |
| tab 标题 / tab 图标 / 页签图标 | outer tab | `outer-tab` | `updateTab` | 需要显式 tab 线索，或明确 `tabSchemaUid` / `RootPageTabModel` |
| 弹窗里 tab 的标题 / 图标 | popup tab | `popup-tab` | `updatePopupTab` | 需要 popup tab 线索，或明确 `ChildPageTabModel` |
| 页面标题 / 页面图标（无位置线索） | 默认按页面入口 | `menu-item` | `updateMenu` | 默认猜测菜单入口；不能无提示地默认成 `updateTab` |

- `page.icon` 不是左侧菜单图标的同义词。
- `page.icon` 也不是默认可见的 page header icon 路径；只有确认 header 渲染链消费它，才可以承诺效果。
- 没有显式 tab 线索时，不要因为页面是 route-backed，就默认选择 `updateTab`。

## `outer-tab` 与 `popup-tab` 的判别

- `get(...).tree.use = RootPageTabModel` -> `outer-tab`
- `get(...).tree.use = ChildPageTabModel` -> `popup-tab`
- uid 直接来自 `createPage` / `addTab` 返回的 `tabSchemaUid` -> `outer-tab`
- uid 直接来自 `addPopupTab` 或 popup subtree 读回 -> `popup-tab`
- 只看到 `kind = "tab"` 不足以选 API；必须先确认 `tree.use` 或 uid 来源。

## 默认写流程

1. **按菜单标题发现父菜单**：`desktop_routes_list_accessible(tree=true)`，只接受唯一命中的 `group`；同时记住它只代表当前角色可见菜单树，不能把“没看到”直接推断成“系统不存在”。
2. **新建菜单分组**：`createMenu(type="group")`；如需继续在该分组下建页面，复用返回的 `routeId` 作为 `parentMenuRouteId`。
3. **新建完整页面**：`createMenu(type="item", parentMenuRouteId=...) -> createPage(menuRouteId=routeId)`；`createMenu(type="item")` 阶段拿到的 `pre-init ids` 只能继续用于初始化链路；继续搭内容时，对 `createPage` 返回的 `gridUid` 走 `[按 normative contract 判断是否追加 catalog] -> compose/add* + settings/configure -> readback`。
4. **兼容模式下先建页面再移入菜单**：`createPage` 不传 `menuRouteId` 只在用户明确接受 standalone / compat page 的副作用时允许；若用户还要求挂进某个菜单，再执行 `updateMenu`。
5. **已有 `page` 新增 `outer-tab`**：先读回 `page` 拿到 `pageUid`，再 `addTab(target.uid = pageUid)`。
6. **已有 target 小改或精确追加**：`get -> [按 normative contract 判断是否追加 catalog] ->` 先优先选择 `compose/add*`，再考虑 `configure/updateSettings`；只有用户明确接受整体替换、且你已经读过当前完整状态时，才允许 `setLayout/setEventFlows`；`apply/mutate` 只在公开入口无法表达、且用户明确接受影响范围时再用。
7. **已有 popup subtree 写入**：若当前执行链没有直接拿到 popup uid，先从 `hostUid` 或 `popupPageUid` 读回 popup subtree；record popup 的 `currentRecord` guard 统一看 [popup.md](./popup.md)。

## Prompt 回归样例

- `给这个页面加个小图标` -> 默认按 `menu-item -> updateMenu`
- `改左侧菜单标题的图标` -> `menu-item -> updateMenu`
- `改页面顶部标题文案` -> `page -> configure`
- `改页面顶部图标` -> 先查渲染链，不默认承诺可见效果
- `改这个 tab 的图标` -> `outer-tab -> updateTab`
- `改弹窗里 tab 的图标` -> `popup-tab -> updatePopupTab`
- `给页面标题加图标` -> 默认按菜单入口处理，并先在 commentary 说明这是默认猜测
