# Capability Matrix

## Block 能力矩阵

| public type | formal key | model use | owner plugin | formal builtin | fixture captured | 顶层可加 | readback | create | 需要 resource | 默认策略 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `jsBlock` | `js-block` | `JSBlockModel` | `@nocobase/core/client` | 是 | 是 | 是 | 是 | 是 | 否 | 默认可创建 | JS 自定义区块 |
| `table` | `table` | `TableBlockModel` | `@nocobase/core/client` | 是 | 是 | 是 | 是 | 是 | 是 | 默认可创建 | 支持 block actions 和 `recordActions` |
| `createForm` | `create-form` | `CreateFormModel` | `@nocobase/core/client` | 是 | 是 | 是 | 是 | 是 | 是 | 默认可创建 | 新增表单 |
| `editForm` | `edit-form` | `EditFormModel` | `@nocobase/core/client` | 是 | 是 | 是 | 是 | 是 | 是 | 默认可创建 | 编辑表单 |
| `form` | - | `FormBlockModel` | `@nocobase/core/client` | 否 | 否 | 是 | 是 | 是 | 是 | 兼容使用 | 可创建，但不是 formal builtin |
| `details` | `details` | `DetailsBlockModel` | `@nocobase/core/client` | 是 | 是 | 是 | 是 | 是 | 是 | 默认可创建 | 支持 `recordActions` |
| `filterForm` | `filter-form` | `FilterFormBlockModel` | `@nocobase/core/client` | 是 | 是 | 是 | 是 | 是 | 是 | 默认可创建 | 默认给 table/details/list/gridCard/map/comments 提供筛选；chart 仅在现场读回确认 targetable 时再用 |
| `list` | `list` | `ListBlockModel` | `@nocobase/plugin-block-list` | 是 | 是 | 是 | 是 | 是 | 是 | 默认可创建 | item 级 `recordActions` |
| `gridCard` | `grid-card` | `GridCardBlockModel` | `@nocobase/plugin-block-grid-card` | 是 | 是 | 是 | 是 | 是 | 是 | 默认可创建 | card item 级 `recordActions` |
| `markdown` | `markdown` | `MarkdownBlockModel` | `@nocobase/plugin-block-markdown` | 是 | 是 | 是 | 是 | 是 | 否 | 默认可创建 | 静态说明内容 |
| `iframe` | `iframe` | `IframeBlockModel` | `@nocobase/plugin-block-iframe` | 是 | 是 | 是 | 是 | 是 | 否 | 默认可创建 | URL 或 HTML 嵌入 |
| `map` | `map` | `MapBlockModel` | `@nocobase/plugin-map` | 是 | 是 | 是 | 是 | 否 | 是 | 只读说明 | 可读回，不应默认创建 |
| `chart` | `chart` | `ChartBlockModel` | `@nocobase/plugin-data-visualization` | 是 | 是 | 是 | 是 | 是 | 否 | 默认可创建 | 核心配置走 `configure` |
| `comments` | `comments` | `CommentsBlockModel` | `@nocobase/plugin-comments` | 是 | 是 | 是 | 是 | 否 | 是 | 只读说明 | 可读回，不应默认创建 |
| `actionPanel` | `action-panel` | `ActionPanelBlockModel` | `@nocobase/plugin-block-workbench` | 是 | 是 | 是 | 是 | 是 | 否 | 默认可创建 | 常用于工具面板 |

## Action scope 与容器矩阵

| scope | 典型容器 use | 对外语义 | 典型 action |
| --- | --- | --- | --- |
| `block` | `TableBlockModel`、`ListBlockModel`、`GridCardBlockModel` | collection block 顶部操作 | `addNew`、`refresh`、`filter`、`triggerWorkflow` |
| `record` | `TableActionsColumnModel`、`DetailsBlockModel`、`ListItemModel`、`GridCardItemModel` | 单条记录/单个 item 操作 | `view`、`edit`、`popup`、`delete`、`updateRecord` |
| `form` | `FormBlockModel`、`CreateFormModel`、`EditFormModel` | 表单提交类操作 | `submit`、`triggerWorkflow`、`js` |
| `filterForm` | `FilterFormBlockModel` | 筛选提交/重置/折叠 | `submit`、`reset`、`collapse`、`js` |
| `actionPanel` | `ActionPanelBlockModel` | 工具面板动作 | `js`、`triggerWorkflow` |

关键约束：

- `row` 已废弃，统一使用 `record`。
- `table/details/list/gridCard` 的记录级动作统一命名为 `recordActions`。
- `addAction` 与 `addRecordAction` 不可互换。
- `details` 虽然是 block，但它的公开动作能力属于 `recordActions`，不要误当成普通 block actions。
- `actionPanel` 只暴露 action-panel scope 的动作，不继承 collection block action 列表。

## Field 能力矩阵

| 容器 | 绑定字段 | 关系叶子字段 | `renderer: "js"` | standalone JS |
| --- | --- | --- | --- | --- |
| `table` | 是 | 是 | 是 | `jsColumn` |
| `details` | 是 | 是 | 是 | 否 |
| `list` | 是 | 是 | 是 | 否 |
| `gridCard` | 是 | 是 | 是 | 否 |
| `form/createForm/editForm` | 是 | 一般不建议叶子链过深 | 是 | `jsItem` |
| `filterForm` | 是 | 作为筛选字段来源 | 否 | 否 |

关键约束：

- `renderer: "js"` 不允许用于 `filterForm`。
- `jsColumn` 只允许在 table 容器。
- `jsItem` 只允许在 form/createForm/editForm 容器。
- to-many 关系叶子路径如 `roles.title` 可用于 display 场景。
- `list/gridCard` 的绑定 `renderer: "js"` 与 `table/details` 一样会落成 `JSFieldModel`。
