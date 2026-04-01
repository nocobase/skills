# Runtime Truth Overview

本文件是这套 skill 的 canonical runtime truth。默认流程、locator 与 target 角色、以及“先读再写”的基本约束统一以这里为准；其他文档只做补充，不再定义第二套基础规则。

## Scope

这里只定义 NocoBase Modern page(v2) 的 UI surface 规则：

- route-backed page / tab 生命周期
- popup child tab 生命周期
- page / tab / popup 内的 block / field / action / layout / configuration
- UI surface 范围内的 popup、openView、event flow 绑定

如果任务需要 collections、records、ACL、workflow 等额外上下文，可以调用其他 NocoBase MCP tools；但这些工具不改写本文件定义的 UI surface locator、target 与生命周期规则。

## Surface Families

- route-backed page
  - 典型标识：`pageUid`、`pageSchemaUid`、`routeId`
  - page 级生命周期写接口用 `pageUid`
- route-backed tab
  - 典型标识：`tabSchemaUid`
  - 外层 tab 的 canonical uid 直接就是 `tabSchemaUid`
- popup page
  - 典型标识：`popupPageUid` 或读回得到的 `ChildPageModel.uid`
- popup child tab
  - 典型标识：`popupTabUid`、`tabUid` 或读回得到的 `ChildPageTabModel.uid`

`get(...).target.kind = "tab"` 只能说明节点类型是 tab，不能单独决定该走哪套生命周期 API；要继续看 `tree.use` 是 `RootPageTabModel` 还是 `ChildPageTabModel`，以及这个 uid 的来源。

## 运行时层次

这套 skill 的运行时心智模型分四层：

1. 读取层
   - `get`
   - `catalog`
   - 作用：确认“现在有什么”和“这里允许做什么”。
2. 语义层
   - `createPage`
   - `compose`
   - `configure`
   - `addTab` / `updateTab` / `moveTab` / `removeTab` / `destroyPage`
   - `addPopupTab` / `updatePopupTab` / `movePopupTab` / `removePopupTab`
   - 作用：优先用公开语义搭建页面，而不是先碰底层 path。
3. 精确层
   - `addBlock` / `addBlocks`
   - `addField` / `addFields`
   - `addAction` / `addActions`
   - `addRecordAction` / `addRecordActions`
   - `updateSettings` / `setEventFlows` / `setLayout`
   - `moveNode` / `removeNode`
   - 作用：补充语义层无法直接表达的精确追加或精确改配。
4. 编排层
   - `apply`
   - `mutate`
   - 作用：多步事务化操作、整段 subtree 替换、复杂修复。

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
- `tabSchemaUid` 直接用于 route-backed tab 的 `updateTab`、`moveTab`、`removeTab`，也可以直接作为 outer tab surface 的 `target.uid`。
- `popupPageUid` 用于 `addPopupTab` 与 popup page 级读写。
- `popupTabUid` / `tabUid` 用于 `updatePopupTab`、`movePopupTab`、`removePopupTab`，也可以直接作为 popup tab surface 的 `target.uid`。
- `pageSchemaUid`、`routeId` 仍然主要用于 `get`；如果手上只有这类 locator，先 `get` 再继续写。

## 默认选择顺序

- 新建完整页面：`createPage -> catalog(target=returned gridUid 或 tabSchemaUid) -> compose -> configure -> get`
- page / tab 生命周期：`get -> addTab/updateTab/moveTab/removeTab/destroyPage -> get`
- popup child tab 生命周期：`get(hostUid 或 popupPageUid) -> addPopupTab/updatePopupTab/movePopupTab/removePopupTab -> get`
- 已有页面小改：`get -> catalog -> configure -> get`
- 已有页面精确追加：`get -> catalog -> add* 或 compose -> configure(如需要) -> get`
- 高风险复杂改造：`get -> catalog -> apply/mutate -> get`
- popup / event flow：先写 popup / openView 相关 settings，再 `setEventFlows`，最后 `get`

新页面在 `createPage` 之前没有现成 target，不要先对一个尚不存在的 page/tab/grid 调 `catalog`。

## 默认 block 策略

- 默认可创建：`table`、`createForm`、`editForm`、`details`、`filterForm`、`list`、`gridCard`、`markdown`、`iframe`、`chart`、`actionPanel`、`jsBlock`
- 兼容但不默认推荐：`form`
- `map/comments` 不提供默认 happy-path 示例；是否可创建、如何改配，以现场 contract 为准

## 为什么 `catalog` 是硬前置

`catalog` 是当前 target 的公开 contract 快照。它告诉你：

- 可创建的 block 列表
- 可创建的 field 列表
- 可创建的 action / recordAction 列表
- 当前节点可编辑的 domains
- `settingsSchema`
- `settingsContract`
- `eventCapabilities`
- `layoutCapabilities`

不先读 `catalog`，就容易犯这些错：

- 把 record action 写进 `addAction`
- 在不支持 `renderer: "js"` 的容器里加 JS 字段
- 给不支持 layout 的节点调用 `setLayout`
- 在不支持的 group/path 上调用 `updateSettings`
- 把 `map/comments` 误判成默认可创建 block

## 为什么 `get` 是硬前置

`get` 不是只看树，它还是修复和校验的基准：

- 找到真实 `uid`
- 找到 `wrapperUid/fieldUid/innerFieldUid`
- 找到 `actionsColumnUid`
- 找到 popup page/tab/grid uid
- 区分 `RootPageTabModel` 与 `ChildPageTabModel`
- 找到 route / pageRoute / tabRoute
- 获取 `nodeMap` 方便后续定位

## 语义化搭建的核心原则

- 先选对 block，再选 field/action，再补配置。
- 优先生成“可以直接工作”的页面，不生成临时过渡结构。
- 优先公开语义，不优先 raw path。
- 任何自然语言映射都必须回到当前 `catalog` 的能力矩阵上收敛。
- 如果文档、示例和现场能力冲突，以现场 `catalog/get` 和更保守的策略为准。
