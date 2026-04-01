# Actions

动作要先看 scope，再看容器，再看是否属于记录级。scope 策略统一看 [../../runtime-truth/capability-matrix.md](../../runtime-truth/capability-matrix.md)。

## Scope 速查

| scope | 典型容器 | 典型入口 | 什么时候用 |
| --- | --- | --- | --- |
| `block` | `table`、`list`、`gridCard` | `addAction` / `actions` | 对整块数据集生效 |
| `record` | `table`、`details`、`list`、`gridCard` | `addRecordAction` / `recordActions` | 对单条记录或单个 item 生效 |
| `form` | `form`、`createForm`、`editForm` | `addAction` / `actions` | 表单提交类动作 |
| `filterForm` | `filterForm` | `addAction` / `actions` | 筛选提交 / 重置 / 折叠 |
| `actionPanel` | `actionPanel` | `addAction` / `actions` | 工具面板动作 |

## 高频 collection / block actions

- `filter`
- `addNew`
- `popup`
- `refresh`
- `expandCollapse`
- `bulkDelete`
- `bulkEdit`
- `bulkUpdate`
- `export`
- `exportAttachments`
- `import`
- `link`
- `upload`
- `composeEmail`
- `templatePrint`
- `triggerWorkflow`
- `js`

关键点：

- 对整块数据集生效的动作，归到 collection / block action。
- `addNew` 常常配 createForm popup。
- `bulk*` 系列主要在 table。

## 高频 record actions

- `view`
- `edit`
- `popup`
- `delete`
- `updateRecord`
- `duplicate`
- `addChild`
- `composeEmail`
- `templatePrint`
- `triggerWorkflow`
- `js`

关键点：

- 通过 `addRecordAction` 或 `recordActions` 创建。
- 不要塞进 `addAction`。
- table 的 record action 实际会挂在 actions column 容器下，读回时留意 `parentUid` 和 `actionsColumnUid`。

## form / filterForm / actionPanel actions

- `form` 常见：`submit`、`triggerWorkflow`、`js`
- `filterForm` 常见：`submit`、`reset`、`collapse`、`js`
- `actionPanel` 常见：`js`、`triggerWorkflow`

关键点：

- `submit` 在普通 form 和 `filterForm` 是两个不同 scope 的公开能力。
- `collapse` 只属于 `filterForm`。
- 如果用户说“搜索”“筛选”“重置条件”，优先映射到 filter-form action，而不是普通 form action。
