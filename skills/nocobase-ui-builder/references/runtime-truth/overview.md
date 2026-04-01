# Runtime Truth Overview

本文件是这套 skill 的 canonical runtime truth。默认流程、locator 与 target 角色、以及“先读再写”的基础约束统一以这里为准；其他文档只补充场景差异，不再定义第二套基础规则。

## 目录

- Scope
- Surface Families
- Popup Glossary
- Locator 与 Target
- 默认 Playbooks
- Authoritative Rules
- Further Reading

## Scope

这里只定义 NocoBase Modern page(v2) 的 UI surface 规则：

- route-backed page / tab 生命周期
- popup child tab 生命周期
- page / tab / popup 内的 block / field / action / layout / configuration
- UI surface 范围内的 popup、openView、event flow 绑定

如果任务需要 collections、records、ACL、workflow 等额外上下文，可以调用其他 NocoBase MCP tools；但这些工具不改写这里定义的 UI surface locator、target 与生命周期规则。

## Surface Families

- route-backed page
  - 常见标识：`pageUid`、`pageSchemaUid`、`routeId`
  - page 级生命周期写接口用 `pageUid`
- route-backed tab
  - 常见标识：`tabSchemaUid`
  - 外层 tab 的 canonical uid 直接就是 `tabSchemaUid`
- popup page
  - 常见标识：`popupPageUid` 或读回得到的 `ChildPageModel.uid`
- popup child tab
  - 常见标识：`popupTabUid`、`tabUid` 或读回得到的 `ChildPageTabModel.uid`

`get(...).target.kind = "tab"` 只能说明节点类型是 tab，不能单独决定该走哪套 lifecycle API；继续看 `tree.use` 是 `RootPageTabModel` 还是 `ChildPageTabModel`，以及这个 uid 的来源。

## Popup Glossary

- `hostUid`
  - 打开 popup 的宿主 action / field / block 的 uid
  - 当只有宿主 uid 时，先 `get({ uid: hostUid })` 再拿 popup 相关 uid
- `popupPageUid`
  - popup page 的 canonical uid
  - 用于 popup page 级读写，以及 `addPopupTab.target.uid`
- `popupTabUid`
  - popup-capable 宿主写接口返回的 popup child tab canonical uid
- `tabUid`
  - `addPopupTab` 返回的 popup child tab canonical uid
  - 和 `popupTabUid` 处于同一语义域，只是字段名来源不同
- `popupGridUid`
  - popup-capable 宿主写接口返回的 popup 内容区 uid
- `gridUid`
  - `addPopupTab` 返回的 popup 内容区 uid
  - 和 `popupGridUid` 处于同一语义域，只是字段名来源不同

## Locator 与 Target

| 标识 | 读取时怎么传 | 常见写入用途 | 不适用 / 不要混用 |
| --- | --- | --- | --- |
| `uid` | `get({ uid })` | 已有普通节点、popup 宿主、精确定位 | 不是 `pageSchemaUid` / `routeId` 的替代字段 |
| `pageUid` | `get({ uid: pageUid })` | `addTab`、`destroyPage` 等 page 级写接口 | 不用于 `updateTab` / `addPopupTab` |
| `tabSchemaUid` | `get({ tabSchemaUid })` | `updateTab`、`removeTab`、outer tab surface 的 `catalog/configure` | 不用于 `addTab` / `addPopupTab` |
| `gridUid`（来自 `createPage/addTab`） | `get({ uid: gridUid })` | route-backed page/tab 内容区的 `catalog/compose/add*` | 不用于 `updateTab` / `addPopupTab` |
| `popupPageUid` | `get({ uid: popupPageUid })` | `addPopupTab`、popup page 级 `catalog/configure` | 不用于 `updatePopupTab` / `removePopupTab` |
| `popupTabUid` / `tabUid` | `get({ uid: popupTabUid })` / `get({ uid: tabUid })` | `updatePopupTab`、`removePopupTab`、popup tab surface 的 `catalog/configure` | 不用于 `addPopupTab` |
| `popupGridUid` / `gridUid`（来自 popup） | `get({ uid: popupGridUid })` / `get({ uid: gridUid })` | popup 内容区的 `catalog/compose/add*` | 不用于 `updatePopupTab` / `removePopupTab` |
| `pageSchemaUid` | `get({ pageSchemaUid })` | 页面级读回 | 不直接放进 `target.uid` |
| `routeId` | `get({ routeId })` | 按路由读回 | 不直接放进 `target.uid` |

## 默认 Playbooks

### 新建完整页面

- 先 `createPage`
- 如果后续要写 tab 内容区：`catalog(target.uid=gridUid) -> compose -> configure -> get({ pageSchemaUid })`
- 如果后续要做 tab 元信息改配或判断 outer tab surface 能力：`catalog(target.uid=tabSchemaUid) -> configure -> get({ pageSchemaUid })`

### 已有 page 新增外层 tab

- 先 `get({ pageSchemaUid })`、`get({ routeId })` 或 `get({ uid: pageUid })` 拿到 `pageUid`
- 再 `addTab(target.uid=pageUid)`
- 如果后续要写 tab 内容区：`catalog(target.uid=gridUid) -> compose -> configure -> get({ pageSchemaUid })`
- 如果后续要做 tab 元信息改配：`catalog(target.uid=tabSchemaUid) -> configure -> get({ pageSchemaUid })`

### 已有页面增量修改

`get -> catalog -> configure -> 最小必要读回`

### 已有页面精确追加

`get -> catalog -> add* 或 compose -> configure(如需要) -> 最小必要读回`

### 已有 popup subtree 写入

- 先 `get({ uid: hostUid })` 或 `get({ uid: popupPageUid })`
- 先确认本次写入目标是 `popupPageUid`、`popupTabUid` / `tabUid` 还是 `popupGridUid` / `gridUid`
- 再对对应 popup target 做 `catalog`
- 后续按 `compose/configure/add*` 分流

### popup child tab lifecycle

#### 新增 popup child tab

- 先 `get({ uid: hostUid })` 或 `get({ uid: popupPageUid })`
- 再 `addPopupTab(target.uid=popupPageUid)`
- 如需继续写 tab 内容，再对返回的 `gridUid` 做 `catalog`
- 最后 `get({ uid: popupPageUid })`

#### 更新 popup child tab

- 先 `get({ uid: popupTabUid })` 或 `get({ uid: tabUid })`
- 再 `updatePopupTab(target.uid=popupTabUid 或 tabUid)`
- 最后 `get({ uid: popupTabUid })` 或 `get({ uid: tabUid })`

#### 排序 popup child tab

- 先 `get({ uid: popupPageUid })`
- 再 `movePopupTab(sourceUid=popupTabUid 或 tabUid, targetUid=popupTabUid 或 tabUid)`
- 最后 `get({ uid: popupPageUid })`

#### 删除 popup child tab

- 先 `get({ uid: popupTabUid })` 或 `get({ uid: tabUid })`
- 再 `removePopupTab(target.uid=popupTabUid 或 tabUid)`
- 最后 `get({ uid: popupPageUid })`，或读回该 tab 的宿主 / 父级 target

### 只读校验 / review

`get -> 如需 contract 或能力判别再 catalog -> 按变更类型或目标类型套用 readback checklist；无明确写入意图时不调用写接口`

### 事件流、布局与复杂编排

`get -> catalog -> 先写 popup/openView 或公开配置 -> 再 setEventFlows/setLayout/apply/mutate -> get`

新页面在 `createPage` 之前没有现成 target，不要先对一个尚不存在的 page/tab/grid 调 `catalog`。

## Authoritative Rules

- 已有 target 上的写入，默认先 `get -> catalog -> write`；只有 `createPage`、`addTab`、`addPopupTab` 或 popup-capable 宿主写接口刚返回了新 target 时，才允许跳过前置 `get`。
- 对刚拿到的新 target，也先 `catalog` 再决定 `compose/configure/add*`；不要因为 uid 是新返回的就跳过能力确认。
- `get` 一次只传一个 root locator；除 `pageSchemaUid`、`tabSchemaUid`、`routeId` 外，其余 opaque id 默认都填进 `uid`。
- route-backed tab 与 popup child tab 是两套 lifecycle API；`kind = "tab"` 不足以区分，继续看 `tree.use` 和 uid 来源。
- 只读校验或审计请求默认 `get -> optional catalog -> readback assertions`，不要为了“确认一下”去创建临时节点或写回配置。
- 先看 `configureOptions`，公开配置表达不了时才看 `catalog.settingsContract`，再决定是否用 `updateSettings`。
- `setEventFlows`、`setLayout` 属于标准精确编辑能力，不是最后兜底；但事件流仍然要在 popup / openView 相关 settings 落盘后再写。
- 如果某个 block 暴露 `dataScope.filter`，这个 `filter` 必须是 FilterGroup；空筛选默认写 `dataScope.filter = null`，`{}` 只当兼容旧形状，不要优先生成；不要直接传 query object。
- `filterForm` 多目标场景下，只使用当前 contract 明确暴露的 target 绑定字段，优先 `defaultTargetUid`。
- 写入后按变更类型做最小必要读回；页面 / tab / popup child tab 生命周期变更再做完整 route/tree 校验。
- 默认可创建 / 兼容使用 / 保守维护策略统一看 [capability-matrix.md](./capability-matrix.md)。

## Further Reading

- 能力策略与默认创建边界：[capability-matrix.md](./capability-matrix.md)
- 请求形状与错误示例：[tool-shapes.md](./tool-shapes.md)
- 读回与验收：[../contracts/readback-checklist.md](../contracts/readback-checklist.md)
