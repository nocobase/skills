# Semantic Building

这组工具优先表达“想搭成什么”，而不是“底层怎么 patch”：

- `compose` -> `mcp__nocobase__flow_surfaces_compose`
- `configure` -> `mcp__nocobase__flow_surfaces_configure`

## 何时用

- 新建页面或新 tab 后的首轮内容搭建
- 标准 block 组合，例如 `filterForm + table`、`gridCard`、`createForm`、`details`
- 任何已经通过 `configureOptions` 公开暴露的配置改动，例如 page title、pageSize、clickToOpen、openView、confirm

## 默认顺序

- 基础默认流程统一看 [../runtime-truth/overview.md](../runtime-truth/overview.md)
- 先用 `compose` 搭结构
- 再用 `configure` 做公开高频改配
- 只有 `configureOptions` 已经不够表达时，才查看 `catalog.settingsContract`，再决定是否用 `updateSettings`

## 关键 gotchas

- `compose` 的 `recordActions` 只对 `table/details/list/gridCard` 有意义
- `form` 不是新增页面默认首选；默认优先 `createForm` / `editForm`
- `map/comments` 等非默认创建能力的策略统一看 [../runtime-truth/capability-matrix.md](../runtime-truth/capability-matrix.md)
- `configure` 只写公开 `configureOptions`，不猜 path

基础 shape 统一看 [../runtime-truth/tool-shapes.md](../runtime-truth/tool-shapes.md)。
