# Page And Tab Lifecycle

这组工具负责两类 tab 生命周期：外层 route-backed page/tab，以及 popup child tab。

## Route-backed page / tab

- `createPage` -> `mcp__nocobase__flow_surfaces_create_page`
- `addTab` -> `mcp__nocobase__flow_surfaces_add_tab`
- `updateTab` -> `mcp__nocobase__flow_surfaces_update_tab`
- `moveTab` -> `mcp__nocobase__flow_surfaces_move_tab`
- `removeTab` -> `mcp__nocobase__flow_surfaces_remove_tab`
- `destroyPage` -> `mcp__nocobase__flow_surfaces_destroy_page`

## 何时用

- 新建 route-backed 页面时用 `createPage`
- 在已有 page 下新增、改名、排序、删除 tab 时用对应 tab lifecycle tools
- 删除整页时用 `destroyPage`，不要只删 route 或只删某棵 tree

## 默认流程

- 新页面：`createPage -> catalog(target=gridUid) -> compose -> configure -> get`
- 现有页面加 tab：`get(pageSchemaUid/routeId) -> addTab(target.uid=pageUid) -> catalog(target=returned gridUid 或 tabSchemaUid) -> compose -> get`
- 改 tab 元信息：`get -> updateTab -> get`
- 排序或删除：`get -> moveTab/removeTab -> get`

## 关键 gotchas

- page 级写接口用 `pageUid`
- route-backed tab 的 canonical uid 直接用 `tabSchemaUid`
- `addTab` 只接受 page 的 `pageUid`
- `updateTab` 只接受 route-backed tab 的 `tabSchemaUid`
- `moveTab` 用 route-backed tab 的 `tabSchemaUid` 作为 `sourceUid/targetUid`
- `removeTab` 用根级 `requestBody.uid`，这里直接传 `tabSchemaUid`

## Popup Child Tab

- `addPopupTab` -> `mcp__nocobase__flow_surfaces_add_popup_tab`
- `updatePopupTab` -> `mcp__nocobase__flow_surfaces_update_popup_tab`
- `movePopupTab` -> `mcp__nocobase__flow_surfaces_move_popup_tab`
- `removePopupTab` -> `mcp__nocobase__flow_surfaces_remove_popup_tab`

## 何时用

- 已有 popup page 下新增、改名、排序、删除 popup child tab
- popup tab 内继续 `compose` / `configure` / `add*`

## 默认流程

- 已有 popup 宿主：优先复用宿主写接口返回的 `popupPageUid/popupTabUid/popupGridUid`
- 只有宿主 uid：`get(hostUid) -> 取 popupPageUid/popupTabUid -> addPopupTab/updatePopupTab/movePopupTab/removePopupTab -> get`
- 新增 popup child tab：`addPopupTab(target.uid=popupPageUid) -> catalog(target=returned gridUid 或 tabUid) -> compose -> get`

## 关键 gotchas

- popup child tab 不要混用外层 `addTab/updateTab/moveTab/removeTab`
- popup page 的 target uid 是 `popupPageUid` 或 `ChildPageModel.uid`
- popup child tab 的 target uid 是 `popupTabUid`、`tabUid` 或 `ChildPageTabModel.uid`
- `movePopupTab` 用 sibling popup child tab uid 的 `sourceUid/targetUid`
- `removePopupTab` 是 target-based 形状，不是根级 `{ "uid": "..." }`
- `kind = "tab"` 不足以区分两类 tab；继续看 `tree.use` 是 `RootPageTabModel` 还是 `ChildPageTabModel`

基础 shape 统一看 [../runtime-truth/tool-shapes.md](../runtime-truth/tool-shapes.md)。
