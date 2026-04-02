# Runtime Playbook

本文档是 target family 判别、write target / read locator 角色，以及默认写流程的主参考文档。live MCP tool schema 与现场 `get/catalog/readback` 优先于本文；请求形状看 [tool-shapes.md](./tool-shapes.md)，写后验证看 [readback.md](./readback.md)。

## UID / Locator Glossary

| 名称 | 角色 | 放在哪里 | 典型来源 |
| --- | --- | --- | --- |
| `uid` | 通用节点读定位符；普通节点写 target 也直接用它 | `get` 根级 locator；或 `target.uid` / root `uid` | 已知 block / field / action / wrapper / host uid，或 `get` 读回树里的任意节点 uid |
| `pageSchemaUid` | route-backed page 的读定位符 | `get` 根级 locator | `createPage` 返回值；page route / readback |
| `tabSchemaUid` | route-backed outer tab 的读定位符；在当前验证过的实现里通常也可直接作为 outer-tab 写 target uid | `get` 根级 locator；或 `target.uid` / root `uid` | `createPage` / `addTab` 返回值；tab route / readback |
| `routeId` | route-backed page 或 tab 的读定位符 | `get` 根级 locator | `createPage` / `addTab` 返回值；路由读回 |
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

## Surface Families

| 家族 | 语义 | 默认 write target uid | 首选 read locator | 常见用途 |
| --- | --- | --- | --- | --- |
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
- 当前验证过的实现里，outer tab 往往可直接使用 `tabSchemaUid` 写入；如果现场 schema / readback 不一致，以现场为准。

## `outer-tab` 与 `popup-tab` 的判别

- 如果 `get(...).tree.use = RootPageTabModel`，这是 `outer-tab`。
- 如果 `get(...).tree.use = ChildPageTabModel`，这是 `popup-tab`。
- 如果 uid 直接来自 `createPage` / `addTab` 返回的 `tabSchemaUid`，按 `outer-tab` 处理。
- 如果 uid 直接来自 `addPopupTab` 或 popup subtree 读回返回的 popup tab uid，按 `popup-tab` 处理。
- 只看到 `kind = "tab"` 不足以选 API；必须先确认 `tree.use` 或 uid 来源。

## 默认写流程

### 1. 新建完整页面

- `createPage`
- 如果继续搭 `route-content`：对返回的 `gridUid` 走 `catalog -> compose / add* / configure -> readback`
- 如果只改 `outer-tab` 元信息：对返回的 `tabSchemaUid` 走 `catalog -> configure -> readback`

### 2. 已有 `page` 新增 `outer-tab`

- 先读回 `page`，拿到 `pageUid`
- `addTab(target.uid = pageUid)`
- 对返回的 `gridUid` 或 `tabSchemaUid` 再继续 `catalog -> write -> readback`

### 3. 已有 target 小改或精确追加

- `get -> catalog -> compose / configure / add* / updateSettings / setLayout / setEventFlows / apply / mutate -> readback`

### 4. 已有 popup subtree 写入

- 如果当前执行链没有直接拿到 popup 相关 uid，先从 `hostUid` 这个 popup host，或 `popupPageUid` 读回 popup subtree
- 先明确本次目标到底是 `popup-page`、`popup-tab`，还是 `popup-content`
- 如果 popup uid 来自刚创建的 `recordActions.view/edit/popup`，不要在 action 创建后停下；继续对 `popupGridUid` 执行 `catalog -> write -> readback`
- 用户明确说“当前记录 / 本条记录 / 这一行”时，只有在 live `catalog.blocks[].resourceBindings` 明确暴露 `currentRecord` 时，才默认按 `currentRecord` 去搭 `details/editForm`；否则停止猜测
- 再对对应 target 执行 `catalog -> write -> readback`

### 5. `inspect`

- `get`
- 只有在需要 capability / contract 判别时才 `catalog`
- 断言项一律按 [readback.md](./readback.md)
- 无明确写入意图时，不调用写接口
