# Runtime Playbook

这是 `nocobase-ui-builder` 的运行时 owner 文档。它负责：surface family 判别、write target / read locator 角色、工具升级顺序，以及默认写流程。请求形状只看 [tool-shapes.md](./tool-shapes.md)，写后验证只看 [readback.md](./readback.md)。

## Surface Families

| 家族 | 语义 | canonical write target uid | preferred read locator | 常见用途 |
| --- | --- | --- | --- | --- |
| `page` | route-backed 顶层页面 | `pageUid` | `pageSchemaUid`，必要时 `routeId` | `addTab`、`destroyPage`、整页读回 |
| `outer tab` | 页面下的 route-backed tab | `tabSchemaUid` | `tabSchemaUid` | outer tab lifecycle、tab surface `catalog/configure` |
| `route-backed content` | page / outer tab 内继续搭内容的 grid target | `gridUid` | `uid = gridUid` | `catalog/compose/add*` |
| `popup page` | 宿主 action / field 打开的 popup 容器 | `popupPageUid` | `uid = popupPageUid` | `addPopupTab`、popup page `catalog/configure` |
| `popup child tab` | popup 内部 tab | popup tab uid；优先 `popupTabUid`，只有现场只暴露 `tabUid` 时才用 `tabUid` | `uid = popup tab uid` | popup child tab lifecycle、popup tab `catalog/configure` |
| `popup content` | popup page / popup child tab 内的内容 grid | popup content grid uid；优先 `popupGridUid`，只有现场只暴露 `gridUid` 时才用 `gridUid` | `uid = popup content grid uid` | popup 内继续 `compose/add*` |
| `generic node` | 非 lifecycle 节点，例如 block / field / action / wrapper / host | 节点自身 `uid` | `uid = node uid` | 精确改配、局部读回、宿主节点继续写入 |

说明：

- `canonical write target uid` 指写接口里应该放进 `target.uid`，或 lifecycle request body 应该使用的主 uid。
- `preferred read locator` 指读回前后优先采用的定位方式；具体 envelope 仍以 [tool-shapes.md](./tool-shapes.md) 为准。

## 当前执行链与新 target

- **当前执行链** 指单次 assistant 执行这套 skill 的连续操作链，不跨后续用户回合复用 shortcut。
- 只有当前执行链里刚由写接口直接返回的下一个 write target uid，才算 **new target**。
- `createPage` / `addTab` / `addPopupTab` 返回的 `pageUid`、`tabSchemaUid`、`gridUid`、popup 相关 uid 都属于 new target。
- 宿主写接口只有在响应里直接带回 `popupPageUid`、popup tab uid 或 popup content grid uid 时，才允许把这些 popup uid 当成 new target。
- 用户提供的 uid、历史缓存 uid、或之前读回过但不是当前执行链刚返回的 uid，都按已有 target 处理：先 `get`，再写。
- new target 只允许跳过一次前置 `get`；`catalog` 仍然必须执行。

## outer tab 与 popup child tab 的判别

- 如果 `get(...).tree.use = RootPageTabModel`，这是 `outer tab`。
- 如果 `get(...).tree.use = ChildPageTabModel`，这是 `popup child tab`。
- 如果 uid 直接来自 `createPage` / `addTab` 返回的 `tabSchemaUid`，按 `outer tab` 处理。
- 如果 uid 直接来自 `addPopupTab` 或 popup subtree 读回返回的 popup tab uid，按 `popup child tab` 处理。
- 只看到 `kind = "tab"` 不足以选 API；必须先确认 `tree.use` 或 uid 来源。

## 工具升级顺序

| 操作类别 | 首选工具层 | 何时升级 |
| --- | --- | --- |
| 生命周期操作 | `createPage/addTab/updateTab/removeTab/addPopupTab/...` | lifecycle API 表达不了时，才继续看结构或配置层 |
| 新结构搭建 | `compose`；精确追加时用 `add*` | 公开语义不够表达时，才进入精确改配 |
| 公开配置改动 | `configure` | `configureOptions` 不够时再看 `settingsContract` |
| 精确 path-level 改配 | `updateSettings` / `setLayout` / `setEventFlows` | 只有确实需要 subtree 替换或跨多步原子编排时，才进入 `apply/mutate` |
| 复杂编排 | `apply` / `mutate` | 仅在高层语义不足且需要受控编排时使用 |

## 默认写流程

### 1. 新建完整页面

- `createPage`
- 如果继续搭 route-backed content：对返回的 `gridUid` 走 `catalog -> compose/add* 或 configure -> readback`
- 如果只改 outer tab 元信息：对返回的 `tabSchemaUid` 走 `catalog -> configure -> readback`

### 2. 已有 page 新增 outer tab

- 先读回 `page`，拿到 `pageUid`
- `addTab(target.uid = pageUid)`
- 对返回的 `gridUid` 或 `tabSchemaUid` 再继续 `catalog -> write -> readback`

### 3. 已有 target 小改或精确追加

- `get -> catalog -> configure / add* / compose / updateSettings / setLayout / setEventFlows / apply / mutate -> readback`

### 4. 已有 popup subtree 写入

- 如果当前执行链没有直接拿到 popup 相关 uid，先从 `hostUid` 或 `popupPageUid` 读回 popup subtree
- 先明确本次目标到底是 `popup page`、`popup child tab`，还是 `popup content`
- 再对对应 target 执行 `catalog -> write -> readback`

### 5. 只读校验 / review

- `get`
- 只有在需要 capability / contract 判别时才 `catalog`
- 断言项一律按 [readback.md](./readback.md)
- 无明确写入意图时，不调用写接口

## Runtime Rules

- 现场 `get/catalog/readback` 永远比文档描述更高优先级。
- 已有 target 上的写入，默认先 `get -> catalog -> write`。
- 对刚拿到的 new target，也先 `catalog` 再决定具体写法。
- 先看 `configureOptions`；公开配置表达不了时才看 `settingsContract`。
- `setLayout`、`setEventFlows` 属于标准精确编辑能力，不与 `apply/mutate` 视为同一层兜底工具。
- 如果 target 只能靠同一 `parent/subKey` 下多个相同 `use/type` sibling 的相对位置来猜，先停止并收敛唯一 target，再考虑 `apply/mutate`。
- 如果现场没有明确暴露目标能力、target 绑定字段或 settings contract，停止猜测并向用户说明。
- `createPage` 之前没有现成 page target，不要预先猜 page / tab / grid 去调 `catalog`。
