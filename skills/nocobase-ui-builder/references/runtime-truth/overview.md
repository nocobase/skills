# Runtime Truth Overview

本文件是这套 skill 的 canonical runtime truth。默认流程、locator 与 target 角色、以及“先读再写”的基础约束统一以这里为准；其他文档只补充场景差异，不再定义第二套基础规则。

## 目录

- Scope
- Surface Families
- Popup Glossary
- Locator 与 Target
- 默认 Playbooks
- Authoritative Rules
- 操作定义
- 默认 block 策略

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
  - 当只有宿主 uid 时，先 `get(hostUid)` 再拿 popup 相关 uid
- `popupPageUid`
  - popup page 的 canonical uid
  - 用于 popup page 级读写，以及 `addPopupTab.target.uid`
- `popupTabUid`
  - popup-capable 宿主写接口返回的 popup child tab canonical uid
- `tabUid`
  - `addPopupTab` 返回的 popup child tab canonical uid
  - 和 `popupTabUid` 处于同一语义域，只是字段名来源不同
- `popupGridUid`
  - popup 内首次 `catalog/compose` 的常用入口

## Locator 与 Target

| 标识 | 常见来源 | 默认用途 | 能否直接作 `target.uid` |
| --- | --- | --- | --- |
| `uid` | `get` 读回、多数写接口返回 | 已有普通节点、popup 宿主、精确定位 | 是 |
| `pageUid` | `createPage` / `addTab` 返回 | route-backed page 级写接口 | 是 |
| `tabSchemaUid` | `createPage` / `addTab` 返回 | route-backed tab 级读写、outer tab surface target | 是 |
| `gridUid` | `createPage` / `addTab` 返回 | 新页面或新外层 tab 的首次 `catalog/compose` 入口 | 是 |
| `popupPageUid` | popup-capable action/field/block 返回；`get(hostUid)` | popup page 级写接口、popup page 读回 | 是 |
| `popupTabUid` | popup-capable action/field/block 返回；`get(hostUid)` | popup child tab 级读写 | 是 |
| `tabUid` | `addPopupTab` 返回 | popup child tab 级读写 | 是 |
| `popupGridUid` | popup-capable action/field/block 返回 | popup 内首次 `catalog/compose` 入口 | 是 |
| `pageSchemaUid` | `createPage` 返回 | `get(pageSchemaUid)` 页面级读回 | 否 |
| `routeId` | 现场 route 信息 | `get(routeId)` 按路由读回 | 否 |

使用规则：

- `pageUid` 用于 `addTab`、`destroyPage` 等 page 级写接口。
- `gridUid` 优先用于首次在 tab 内容区搭 block / field / action。
- `tabSchemaUid` 直接用于 route-backed tab 的 `updateTab`、`moveTab`、`removeTab`，也可以直接作为 outer tab surface 的 `target.uid`。
- `tabSchemaUid` 也适合做 tab 级 `catalog`、tab 元信息改配，或当你要看整个 outer tab surface 的能力时使用。
- `popupPageUid` 用于 `addPopupTab` 与 popup page 级读写。
- `popupTabUid` / `tabUid` 用于 `updatePopupTab`、`movePopupTab`、`removePopupTab`，也可以直接作为 popup tab surface 的 `target.uid`。
- `pageSchemaUid`、`routeId` 主要用于 `get`；如果手上只有这类 locator，先 `get` 再继续写。

## 默认 Playbooks

### 新建完整页面

`createPage -> catalog(target=returned gridUid 或 tabSchemaUid) -> compose -> configure -> get`

### 已有 page 新增外层 tab

`get(pageSchemaUid / routeId / pageUid) -> addTab(target.uid=pageUid) -> catalog(target=returned gridUid 或 tabSchemaUid) -> compose -> configure(如需要) -> get`

### 已有页面增量修改

`get -> catalog -> configure -> get`

### 已有页面精确追加

`get -> catalog -> add* 或 compose -> configure(如需要) -> get`

### 已有 popup subtree 写入

`创建 popup 宿主或 get(hostUid / popupPageUid) -> 先确认本次写入目标是 popupPageUid / popupTabUid(tabUid) / popupGridUid 中的哪一层 -> catalog(target=对应 popup target) -> compose/configure/add*(如需要) -> get`

### popup child tab lifecycle

`get(hostUid / popupPageUid) -> addPopupTab/updatePopupTab/movePopupTab/removePopupTab -> 如果是新增 child tab 且要继续写内容，再对返回的 tabUid/gridUid 先 catalog，再继续写 -> get`

### 只读校验 / review

`get -> 如需 contract 或能力判别再 catalog -> 按变更类型或目标类型套用 readback checklist；无明确写入意图时不调用写接口`

### 事件流、布局与复杂编排

`get -> catalog -> 先写 popup/openView 或公开配置 -> 再 setEventFlows/setLayout/apply/mutate -> get`

新页面在 `createPage` 之前没有现成 target，不要先对一个尚不存在的 page/tab/grid 调 `catalog`。

## Authoritative Rules

- 已有 target 上的写入，默认先 `get -> catalog -> write`；只有 `createPage`、`addTab`、`addPopupTab` 或 popup-capable 宿主写接口刚返回了新 target 时，才允许跳过前置 `get`。
- 对刚拿到的新 target，也先 `catalog` 再决定 `compose/configure/add*`；不要因为 uid 是新返回的就跳过能力确认。
- route-backed tab 与 popup child tab 是两套 lifecycle API：
  - 外层 page/tab 用 `addTab / updateTab / moveTab / removeTab`
  - popup 内 tab 用 `addPopupTab / updatePopupTab / movePopupTab / removePopupTab`
- 只读校验或审计请求默认 `get -> optional catalog -> readback assertions`，不要为了“确认一下”去创建临时节点或写回配置。
- 先看 `configureOptions`，公开配置表达不了时才看 `catalog.settingsContract`，再决定是否用 `updateSettings`。
- `setEventFlows`、`setLayout` 属于标准精确编辑能力，不是最后兜底；但事件流仍然要在 popup / openView 相关 settings 落盘后再写。
- `map/comments` 属于非默认创建能力：默认不创建；已有 block 只按下文“保守维护”定义处理；只有用户明确要求且现场 `catalog` 明确暴露创建能力时才创建。
- 如果某个 block 暴露 `dataScope.filter`，这个 `filter` 必须是 FilterGroup；空筛选默认写 `dataScope.filter = null`，`{}` 只当兼容旧形状，不要优先生成；不要直接传 query object。
- `filterForm` 多目标场景下，只使用当前 contract 明确暴露的 target 绑定字段，优先 `defaultTargetUid`。
- 写入后按变更类型做最小必要读回；页面 / tab / popup child tab 生命周期变更再做完整 route/tree 校验。

## 操作定义

- `保守维护`
  - 只在已有 `map/comments` block 上做 `get/catalog`、公开配置修改，或 `settingsContract` 已明确的小范围 path-level 修改。
  - 不把它们当默认创建路径；不在没有明确需求时做整棵 subtree 替换、迁移或重建。
- `最小必要读回`
  - 至少读回直接受影响的 target，或它的宿主 / 父级 target，并核对本次变更涉及的结构、配置或 route 字段。
  - 只有 page / tab / popup child tab 生命周期变化、route 同步或 popup target 层级变化时，才升级为完整 route/tree 校验。

## 默认 block 策略

- 默认可创建：`table`、`createForm`、`editForm`、`details`、`filterForm`、`list`、`gridCard`、`markdown`、`iframe`、`chart`、`actionPanel`、`jsBlock`
- 兼容但不默认推荐：`form`
- `map/comments` 不属于默认创建能力；已有 block 按上面的“保守维护”定义处理；如果用户明确要求新建，先看现场 contract 是否暴露创建能力，再决定是否继续
