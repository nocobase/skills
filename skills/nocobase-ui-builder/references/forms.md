# Forms

表单类 block 的默认顺序是：**能明确新增/编辑，就不用兼容 `form`**。

以下直接沿用 `Hard rule` / `Default heuristic` / `Fallback` 术语定义，含义见 [../SKILL.md](../SKILL.md) 的 `Global Rules`。

## 默认创建策略

- `Default heuristic`：默认可创建 `createForm`、`editForm`
- `Fallback`：`form` 只作为兼容路径使用

## 对照表

| block | 默认用途 | 是否需 resource | 动作类型 | 高频配置 | 关键约束 |
| --- | --- | --- | --- | --- | --- |
| `createForm` | 新增记录 | 是 | form actions | `layout`、`labelAlign`、`labelWidth`、`labelWrap`、`colon`、`assignRules` | 默认新增表单；不承载记录级动作 |
| `editForm` | 编辑已有记录 | 是 | form actions | `layout`、`labelAlign`、`labelWidth`、`labelWrap`、`colon`、`assignRules`、`dataScope` | 只有它额外支持 `dataScope`；查看场景优先 `details` |
| `form` | 兼容历史 `FormBlockModel` | 是 | form actions | `layout`、`labelAlign`、`labelWidth`、`labelWrap`、`colon`、`assignRules` | 兼容能力，不是默认推荐路径 |

## 选型规则

- `Default heuristic`：用户要“新建记录 / 录入页 / addNew popup”时，优先 `createForm`
- `Default heuristic`：用户要“编辑弹窗 / 编辑页 / record action edit popup”时，优先 `editForm`
- record popup 的填充顺序与 `currentRecord` guard 统一看 [popup-and-event-flow.md](./popup-and-event-flow.md) 和 [record-popup-recipes.md](./record-popup-recipes.md)
- `Fallback`：用户明确要求“通用表单”或现场已存在 `FormBlockModel` 时，才考虑 `form`
- `Hard rule`：只是查看详情时，不要用 `editForm` 或 `form` 伪装详情页，优先 `details`

## 公开语义

表单类 block 的公开语义统一是：

- `fields`
- `actions`

`Hard rule`：它们只有 **form actions**，不承载 `recordActions`。

## JS 能力

- 表单支持绑定字段 `renderer: "js"` 与 standalone `jsItem`
- 具体 JS 字段能力矩阵与位置限制统一看 [js.md](./js.md)
- `Fallback`：需要更细 path-level 配置时，再看 `settingsContract`

## 写入提醒

- `Hard rule`：新建表单前仍要先确认 target 能创建对应 block
- `Fallback`：`form` 不是默认 happy path；任何写入前仍要先看现场 `catalog(target)`，不要假设它与 `createForm/editForm` 完全等价
