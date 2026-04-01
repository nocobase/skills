# Read And Discovery

这组工具负责先读现状，再决定是否写入：

- `get` -> `mcp__nocobase__flow_surfaces_get`
- `catalog` -> `mcp__nocobase__flow_surfaces_catalog`

## 何时用

- 需要拿真实 `uid`、popup uid、route、tree、nodeMap
- 需要确认当前 target 支持哪些 block / field / action / recordAction
- 需要确认 `settingsContract`、`eventCapabilities`、`layoutCapabilities`
- 需要区分 `RootPageTabModel` 与 `ChildPageTabModel`

## 何时必须先调

- 任何精确写入前先 `catalog`
- 任何修复、重排、删除、多步改造前先 `get`
- 多目标 `filterForm`、popup surface、record action 容器定位前先 `get`
- 只读校验 / review 请求先 `get`；只有需要 contract、能力边界或 target 判别时再 `catalog`

## 关键 gotchas

- `get` 只接受一个根级 locator；如果手上是 `hostUid`、`pageUid`、`popupPageUid`、`popupTabUid`、`gridUid` 这类值，读取时都写成 `get({ uid: ... })`
- `catalog` 是 target-based request shape，必须传 `requestBody.target.uid`
- 新页面在 `createPage` 之前没有现成 target，不要先猜一个 page/tab/grid 去读 `catalog`
- popup 宿主的写接口返回值里可能直接带 `popupPageUid/popupTabUid/popupGridUid`
- 外层 tab 与 popup child tab 都可能读回成 `kind = "tab"`；选生命周期 API 时继续看 `tree.use` 和 uid 来源

基础 shape 统一看 [../runtime-truth/tool-shapes.md](../runtime-truth/tool-shapes.md)。
