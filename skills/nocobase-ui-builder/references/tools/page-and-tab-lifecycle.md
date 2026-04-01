# Page And Tab Lifecycle

这组工具只补充 page/tab lifecycle 的专有约束。基础默认流程、uid 选择和“先读再写”规则统一看 [../runtime-truth/overview.md](../runtime-truth/overview.md)。

## Route-backed page / tab

- `createPage` -> `mcp__nocobase__flow_surfaces_create_page`
- `addTab` -> `mcp__nocobase__flow_surfaces_add_tab`
- `updateTab` -> `mcp__nocobase__flow_surfaces_update_tab`
- `moveTab` -> `mcp__nocobase__flow_surfaces_move_tab`
- `removeTab` -> `mcp__nocobase__flow_surfaces_remove_tab`
- `destroyPage` -> `mcp__nocobase__flow_surfaces_destroy_page`

何时用：

- 新建 route-backed 页面时用 `createPage`
- 在已有 page 下新增、改名、排序、删除外层 tab 时用对应 tab lifecycle tools
- 删除整页时用 `destroyPage`，不要只删 route 或只删某棵 tree

关键 target 选择：

- `addTab.target.uid = pageUid`
- `updateTab.target.uid = tabSchemaUid`
- `moveTab.sourceUid / targetUid = tabSchemaUid`
- `removeTab.requestBody.uid = tabSchemaUid`
- 新外层 tab 的内容区继续写入时，优先对返回的 `gridUid` 做 `catalog`
- 外层 tab 的标题 / 图标 / documentTitle / surface 能力判断，优先对 `tabSchemaUid` 做 `catalog`

## Popup Child Tab

- `addPopupTab` -> `mcp__nocobase__flow_surfaces_add_popup_tab`
- `updatePopupTab` -> `mcp__nocobase__flow_surfaces_update_popup_tab`
- `movePopupTab` -> `mcp__nocobase__flow_surfaces_move_popup_tab`
- `removePopupTab` -> `mcp__nocobase__flow_surfaces_remove_popup_tab`

何时用：

- 已有 popup page 下新增、改名、排序、删除 popup child tab
- popup tab 内继续 `compose` / `configure` / `add*`

关键 target 选择：

- 如果只有宿主 uid，先 `get({ uid: hostUid })` 拿到 `popupPageUid/popupTabUid/popupGridUid`
- `addPopupTab.target.uid = popupPageUid`
- `updatePopupTab/removePopupTab.target.uid = popupTabUid / tabUid`
- `movePopupTab.sourceUid / targetUid = popupTabUid / tabUid`
- popup child tab 新增后如需继续写内容，优先对返回的 `gridUid` 做 `catalog`

关键 gotchas：

- popup child tab 不要混用外层 `addTab/updateTab/moveTab/removeTab`
- `kind = "tab"` 不足以区分两类 tab；继续看 `tree.use` 是 `RootPageTabModel` 还是 `ChildPageTabModel`
- popup page / popup child tab 的 locator 与请求形状统一看 `overview.md` 和 `tool-shapes.md`

基础 shape 统一看 [../runtime-truth/tool-shapes.md](../runtime-truth/tool-shapes.md)。
