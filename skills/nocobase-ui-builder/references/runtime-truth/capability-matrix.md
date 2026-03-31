# Capability Matrix

## Block 能力矩阵

| public type | model use | 顶层可加 | createSupported | 需要 collection resource | 备注 |
| --- | --- | --- | --- | --- | --- |
| `jsBlock` | `JSBlockModel` | 是 | 是 | 否 | 自定义 JS 区块 |
| `table` | `TableBlockModel` | 是 | 是 | 是 | 支持 block actions 和 `recordActions` |
| `createForm` | `CreateFormModel` | 是 | 是 | 是 | 新增表单 |
| `editForm` | `EditFormModel` | 是 | 是 | 是 | 编辑表单 |
| `form` | `FormBlockModel` | 是 | 是 | 是 | 公开但不是 formal builtin |
| `details` | `DetailsBlockModel` | 是 | 是 | 是 | 支持 `recordActions` |
| `filterForm` | `FilterFormBlockModel` | 是 | 是 | 是 | 给 table/details/list/gridCard/chart/map/comments 供筛选 |
| `list` | `ListBlockModel` | 是 | 是 | 是 | item 级 `recordActions` |
| `gridCard` | `GridCardBlockModel` | 是 | 是 | 是 | card item 级 `recordActions` |
| `markdown` | `MarkdownBlockModel` | 是 | 是 | 否 | 静态内容 |
| `iframe` | `IframeBlockModel` | 是 | 是 | 否 | 嵌入外部或 HTML |
| `map` | `MapBlockModel` | 是 | 否 | 是 | 可读回，但当前不应作为默认创建能力 |
| `chart` | `ChartBlockModel` | 是 | 是 | 否 | 图表配置通常较重 |
| `comments` | `CommentsBlockModel` | 是 | 否 | 是 | 可读回，但当前不应作为默认创建能力 |
| `actionPanel` | `ActionPanelBlockModel` | 是 | 是 | 否 | 常用于工具面板 |

## Action scope 与容器矩阵

| scope | 典型容器 use | 对外语义 |
| --- | --- | --- |
| `block` | `TableBlockModel`、`ListBlockModel`、`GridCardBlockModel` | collection block 顶部操作 |
| `record` | `TableActionsColumnModel`、`DetailsBlockModel`、`ListItemModel`、`GridCardItemModel` | 单条记录/单个 item 操作 |
| `form` | `FormBlockModel`、`CreateFormModel`、`EditFormModel` | 表单提交类操作 |
| `filterForm` | `FilterFormBlockModel` | 筛选提交/重置/折叠 |
| `actionPanel` | `ActionPanelBlockModel` | 工具面板动作 |

关键约束：

- `row` 已废弃，统一使用 `record`。
- `table/details/list/gridCard` 的记录级动作统一命名为 `recordActions`。
- `addAction` 与 `addRecordAction` 不可互换。

## 高频 collection actions

| action | 主要容器 | 说明 |
| --- | --- | --- |
| `filter` | table/list/gridCard | 触发筛选或联动筛选 |
| `addNew` | collection blocks | 新增记录，常配 popup |
| `popup` | collection blocks | 自定义集合级 popup |
| `refresh` | collection blocks | 刷新数据 |
| `expandCollapse` | table | 展开/折叠树表 |
| `bulkDelete` | table | 批量删除 |
| `bulkEdit` | table | 批量编辑 |
| `bulkUpdate` | table | 批量更新赋值 |
| `export` | table | 导出 |
| `exportAttachments` | table | 导出附件 |
| `import` | table | 导入 |
| `link` | table | 关联已有记录 |
| `upload` | table | 上传并关联 |
| `composeEmail` | table | 邮件发送 |
| `templatePrint` | table | 模板打印 |
| `triggerWorkflow` | collection blocks / actionPanel | 触发工作流 |
| `js` | 多种容器 | 自定义 JS 动作 |

## 高频 record actions

| action | 主要容器 | 说明 |
| --- | --- | --- |
| `view` | table/details/list/gridCard | 查看 |
| `edit` | table/details/list/gridCard | 编辑 |
| `popup` | table/details/list/gridCard | 自定义 popup |
| `delete` | table/details/list/gridCard | 删除 |
| `updateRecord` | table/details/list/gridCard | 就地更新记录 |
| `duplicate` | table | 复制 |
| `addChild` | tree table | 新增子记录 |
| `composeEmail` | table/details | 邮件发送 |
| `templatePrint` | table/details/list/gridCard | 模板打印 |
| `triggerWorkflow` | table/details/list/gridCard | 触发工作流 |
| `js` | table/details/list/gridCard | 自定义 JS 动作 |

## Field 能力矩阵

| 容器 | 绑定字段 | 关系叶子字段 | `renderer: "js"` | `jsColumn` | `jsItem` |
| --- | --- | --- | --- | --- | --- |
| `table` | 是 | 是 | 是 | 是 | 否 |
| `details` | 是 | 是 | 是 | 否 | 否 |
| `list` | 是 | 是 | 否，走 item display 能力 | 否 | 否 |
| `gridCard` | 是 | 是 | 否，走 item display 能力 | 否 | 否 |
| `form/createForm/editForm` | 是 | 一般不建议叶子链过深 | 是 | 否 | 是 |
| `filterForm` | 是 | 可作为筛选字段来源 | 否 | 否 | 否 |

关键约束：

- `renderer: "js"` 不允许用于 `filterForm`。
- `jsColumn` 只允许在 table 容器。
- `jsItem` 只允许在 form/createForm/editForm 容器。
- to-many 关系叶子路径如 `roles.title` 可用于 display 场景。
