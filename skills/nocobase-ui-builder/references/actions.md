# Actions

动作选择顺序：**先看 scope，再看容器，再看是不是记录级。**

以下直接沿用 `Hard rule` / `Default heuristic` 术语定义，含义见 [../SKILL.md](../SKILL.md) 的 `Global Rules`。

## Scope 速查

| scope | 典型容器 | 典型入口 | 什么时候用 |
| --- | --- | --- | --- |
| `block` | `table`、`list`、`gridCard` | `addAction` / `actions` | 对整块数据集生效 |
| `record` | `table`、`details`、`list`、`gridCard` | `addRecordAction` / `recordActions` | 对单条记录或单个 item 生效 |
| `form` | `form`、`createForm`、`editForm` | `addAction` / `actions` | 表单提交类动作 |
| `filterForm` | `filterForm` | `addAction` / `actions` | 筛选提交 / 重置 / 折叠 |
| `actionPanel` | `actionPanel` | `addAction` / `actions` | 工具面板动作 |

## 先选对入口

- `Hard rule`：`addAction` / `actions` 只放非 `recordActions`
- `Hard rule`：`addRecordAction` / `recordActions` 只放记录级动作
- `Hard rule`：`details` 虽然是 block，但公开动作能力属于 `recordActions`
- `Default heuristic`：`table` 的记录级动作实际挂在 actions column 容器下，读回时留意 `actionsColumnUid`

## 高频 block actions

常见于 `table/list/gridCard`：

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

- `Hard rule`：对整块数据集生效的动作，归到 block / collection action
- `Default heuristic`：`addNew` 常与 `createForm` popup 搭配
- `Default heuristic`：`bulk*` 系列主要在 `table`

## 高频 record actions

常见于 `table/details/list/gridCard`：

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

- `Default heuristic`：默认都通过 `addRecordAction` 或 `recordActions` 创建
- `Hard rule`：不要塞进 `addAction`
- `Hard rule`：`view/edit/popup` 如果会打开 popup，只创建 action 不算完成；后续通常还要继续搭 popup content
- `Default heuristic`：“查看当前记录 / 查看本条 / 查看这一行”默认映射为 `view + details(currentRecord)`
- `Default heuristic`：“编辑当前记录 / 编辑本条 / 编辑这一行”默认映射为 `edit + editForm(currentRecord) + submit`
- `Fallback`：用户只说“加一个弹窗按钮”但没说明内容时，才允许只创建 `popup` shell；此时不要假设已有详情或表单会自动出现
- `Default heuristic`：“查看 / 编辑 / 删除 / 复制 / 新增子级”这类表达，默认先检查容器是否支持 `recordActions`

## form / filterForm / actionPanel actions

- `form`：`submit`、`triggerWorkflow`、`js`
- `filterForm`：`submit`、`reset`、`collapse`、`js`
- `actionPanel`：`js`、`triggerWorkflow`

关键点：

- `Hard rule`：`submit` 在普通 form 和 `filterForm` 是两个不同 scope 的公开能力
- `Hard rule`：`collapse` 只属于 `filterForm`
- `Default heuristic`：如果用户说“搜索 / 筛选 / 重置条件”，优先映射到 filter-form action，而不是普通 form action
