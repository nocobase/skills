# Runtime Playbook

这是 `nocobase-ui-builder` 的运行时主文档。它负责：目标分层、uid 语义、默认写流程、生命周期分流，以及“什么时候必须停止猜测”。请求形状只看 [tool-shapes.md](./tool-shapes.md)。

## 术语速记

- **page**：route-backed 顶层页面
- **outer tab**：页面下的 route-backed tab，canonical uid 是 `tabSchemaUid`
- **popup page**：宿主 action/field 打开的弹窗容器，常见 uid 是 `popupPageUid`
- **popup child tab**：popup 内部 tab，常见 uid 是 `popupTabUid` 或 `tabUid`
- **内容区**：route-backed page/tab 或 popup tab 内继续 `compose/add*` 的 grid target，常见 uid 是 `gridUid` 或 `popupGridUid`

## Surface Families 与 canonical uid

| 家族 | 常见标识 | canonical uid / 主要定位 | 典型用途 |
| --- | --- | --- | --- |
| route-backed page | `pageUid` / `pageSchemaUid` / `routeId` | page 级写接口用 `pageUid`；页面级读回用 `pageSchemaUid` 或 `routeId` | 新增 outer tab、整页删除、页面级读回 |
| outer tab | `tabSchemaUid` | `tabSchemaUid` | outer tab 生命周期、outer tab surface `catalog/configure` |
| route-backed 内容区 | `gridUid` | `gridUid` | `catalog/compose/add*` |
| popup page | `popupPageUid` | `popupPageUid` | `addPopupTab`、popup page 级 `catalog/configure` |
| popup child tab | `popupTabUid` / `tabUid` | `popupTabUid` 或 `tabUid` | popup child tab 生命周期、popup tab surface `catalog/configure` |
| popup 内容区 | `popupGridUid` / `gridUid` | `popupGridUid` 或 `gridUid` | popup 内继续 `compose/add*` |

## `get` locator 与 `target.uid` 的区别

| 值 | 读取时怎么传 | 常见写入用途 | 不要混用 |
| --- | --- | --- | --- |
| `uid` | `get({ uid })` | 已有普通节点、popup 宿主、grid、popup page/tab | 不是 `pageSchemaUid` / `routeId` 的替代字段 |
| `pageUid` | `get({ uid: pageUid })` | `addTab`、`destroyPage` | 不用于 `updateTab` / `addPopupTab` |
| `pageSchemaUid` | `get({ pageSchemaUid })` | 页面级读回 | 不直接放进 `target.uid` |
| `routeId` | `get({ routeId })` | 页面级读回 | 不直接放进 `target.uid` |
| `tabSchemaUid` | `get({ tabSchemaUid })` | `updateTab/removeTab`、outer tab `catalog/configure` | 不用于 `addTab` / `addPopupTab` |
| `gridUid` | `get({ uid: gridUid })` | route-backed 内容区 `catalog/compose/add*` | 不用于 tab lifecycle |
| `popupPageUid` | `get({ uid: popupPageUid })` | `addPopupTab`、popup page `catalog/configure` | 不用于 `updatePopupTab/removePopupTab` |
| `popupTabUid` / `tabUid` | `get({ uid: ... })` | `updatePopupTab/removePopupTab`、popup tab `catalog/configure` | 不用于 `addPopupTab` |
| `popupGridUid` / popup `gridUid` | `get({ uid: ... })` | popup 内容区 `catalog/compose/add*` | 不用于 popup tab lifecycle |

除了 `pageSchemaUid`、`tabSchemaUid`、`routeId` 这 3 个专用字段外，其余 opaque id 在读取时都默认放进 `uid`。

## 先判断 tab 属于哪一层

- `RootPageTabModel`，或 uid 来自 `createPage/addTab` 的，是 **outer tab**：用 `addTab/updateTab/moveTab/removeTab`
- `ChildPageTabModel`，或 uid 来自 `addPopupTab` / popup 宿主读回的，是 **popup child tab**：用 `addPopupTab/updatePopupTab/movePopupTab/removePopupTab`

**只看到 `kind = "tab"` 不能决定 API。**

## 按操作类型选接口

| 操作类别 | 首选接口 | 何时进入下一层 |
| --- | --- | --- |
| 生命周期操作 | `createPage/addTab/updateTab/removeTab/addPopupTab/...` | 生命周期接口表达不了时，才继续看结构或配置接口 |
| 新结构搭建 | `compose`；精确追加时用 `add*` | 公开语义不够表达时，才下钻 path-level 配置 |
| 公开配置改动 | `configure` | `configureOptions` 不够时再看 `settingsContract` |
| path-level 配置 | `updateSettings` / `setLayout` / `setEventFlows` | 需要跨多步原子编排时才看 `apply/mutate` |
| 复杂编排 | `apply` / `mutate` | 仅在高层语义不足且需要受控 subtree 替换或事务一致性时使用 |

## 默认写流程

### 1. 新建完整页面

- `createPage`
- 内容区继续搭建：对返回的 `gridUid` 做 `catalog -> compose/configure -> get({ pageSchemaUid })`
- 只改 outer tab 元信息：对返回的 `tabSchemaUid` 做 `catalog -> configure -> get({ pageSchemaUid })`

### 2. 已有 page 新增 outer tab

- 先 `get({ pageSchemaUid })`、`get({ routeId })` 或 `get({ uid: pageUid })` 拿到 `pageUid`
- `addTab(target.uid=pageUid)`
- 内容区继续搭建：对返回的 `gridUid` 做 `catalog -> compose/configure -> get({ pageSchemaUid })`
- 只改 tab 元信息：对返回的 `tabSchemaUid` 做 `catalog -> configure -> get({ pageSchemaUid })`

### 3. 已有 target 小改

`get -> catalog -> configure -> 最小必要读回`

### 4. 已有 target 精确追加

`get -> catalog -> add* 或 compose -> configure(如需要) -> 最小必要读回`

### 5. 已有 popup subtree 写入

- 先 `get({ uid: hostUid })` 或 `get({ uid: popupPageUid })`
- 确认本次目标是 `popupPageUid`、`popupTabUid/tabUid` 还是 `popupGridUid/gridUid`
- 对对应 popup target 做 `catalog`
- 再按 `compose/configure/add*` 分流

### 6. 只读校验 / review

`get -> 需要 contract 或能力判别时再 catalog -> 按 readback 条目断言；无明确写入意图时不调用写接口`

### 7. 事件流、布局与复杂编排

`get -> catalog -> 先写 popup/openView 或公开配置 -> 再 setEventFlows/setLayout/apply/mutate -> 最小必要读回`

## “新 target” 的严格定义

只有**当前回合**中刚由以下接口返回的 uid，才算“新 target”，可以跳过一次前置 `get`：

- `createPage`
- `addTab`
- `addPopupTab`
- popup-capable 宿主写接口

用户提供的 uid、历史缓存 uid、之前读回过但不是刚创建的 uid，都按“已有 target”处理：**先 `get`，再写**。

## Authoritative Rules

- 已有 target 上的写入，默认先 `get -> catalog -> write`。
- 对刚拿到的新 target，也先 `catalog` 再决定 `compose/configure/add*`；不要因为 uid 是新返回的就跳过能力确认。
- 先看 `configureOptions`；公开配置表达不了时才看 `settingsContract`，再决定是否用 `updateSettings`。
- `setEventFlows`、`setLayout` 属于标准精确编辑能力，不是最后兜底；但事件流仍然要在 popup / openView 相关 settings 落盘后再写。
- 如果某个 block 暴露 `dataScope.filter`，这个 `filter` 必须是 FilterGroup；空筛选默认写 `dataScope.filter = null`，不要优先生成 `{}` 或 query object。
- `filterForm` 多目标场景下，只使用当前 contract 明确暴露的 target 绑定字段，优先 `defaultTargetUid`。
- 写入后按变更类型做最小必要读回；只有 page / tab / popup child tab 生命周期变更才升级为完整 route/tree 校验。
- 如果现场 `get/catalog` 没有明确暴露目标能力、target 绑定字段或 settings contract，停止猜测并向用户说明。
