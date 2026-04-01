# JS

公开 JS 能力分四类：

- `jsBlock`
- `js` action
- 绑定字段的 `renderer: "js"`
- standalone JS 字段：`jsColumn` / `jsItem`

## 容器支持矩阵

| 能力 | 可用位置 | 关键约束 |
| --- | --- | --- |
| `jsBlock` | page/tab/popup 的 block 区 | 用户明确要求运行时代码时再优先 |
| `js` action | `block` / `record` / `form` / `filterForm` / `actionPanel` | 先选对 action scope |
| `renderer: "js"` | `table/details/list/gridCard/form/createForm/editForm` | 仍然绑定真实字段 |
| `jsColumn` | `table` | standalone field，不绑定真实 `fieldPath` |
| `jsItem` | `form/createForm/editForm` | standalone field，不绑定真实 `fieldPath` |

## 高频配置

- `code`
- `version`
- 标题 / label / width / fixed 等容器相关 props
- JS block 常见：`title`、`description`、`className`
- JS 字段常见：`label`、`showLabel`、`width`、`fixed`

## 执行规则

- JS 相关配置优先走 `configure`
- `renderer: "js"` 不是 standalone field type；`jsColumn` / `jsItem` 才是 standalone field type
- `filterForm` 的字段级限制统一看 [fields.md](./fields.md)
