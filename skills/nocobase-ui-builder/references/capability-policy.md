# Capability Policy

本文档定义默认创建策略与保守边界。具体 block/action/field 选型分别看 [blocks.md](./blocks.md)、[forms.md](./forms.md)、[actions.md](./actions.md)、[fields.md](./fields.md)。

## 默认策略怎么执行

- **默认可创建**：可直接创建；仍需以现场 `catalog` 暴露能力为准
- **兼容使用**：只有用户明确要求，且 `catalog` 已暴露能力时才创建
- **保守维护**：默认不创建；只做读回、公开改配或 contract 已明确的小范围修复
- **create = 现场确认**：必须先 `catalog` 确认 contract，再决定是否创建

## Block 策略矩阵

| public type | 是否需 resource | 默认策略 | 备注 |
| --- | --- | --- | --- |
| `table` | 是 | 默认可创建 | 支持 block actions 和 `recordActions` |
| `createForm` | 是 | 默认可创建 | 默认新增表单 |
| `editForm` | 是 | 默认可创建 | 默认编辑表单 |
| `details` | 是 | 默认可创建 | 动作走 `recordActions` |
| `filterForm` | 是 | 默认可创建 | 默认筛选目标是 `table/details/list/gridCard`；`chart` 需现场确认 |
| `list` | 是 | 默认可创建 | item 级 `recordActions` |
| `gridCard` | 是 | 默认可创建 | card 级 `recordActions` |
| `markdown` | 否 | 默认可创建 | 静态说明内容 |
| `iframe` | 否 | 默认可创建 | URL 或 HTML 嵌入 |
| `chart` | 否 | 默认可创建 | 核心配置优先走 `configure` |
| `actionPanel` | 否 | 默认可创建 | action scope 是 `actionPanel` |
| `jsBlock` | 否 | 默认可创建 | 用户明确需要运行时代码时优先 |
| `form` | 是 | 兼容使用 | 只有明确要求兼容 `FormBlockModel` 时才创建 |
| `map` | 是 | 保守维护 / create=现场确认 | 默认不在 happy path 创建 |
| `comments` | 是 | 保守维护 / create=现场确认 | 默认不在 happy path 创建 |

## Action scope 与容器矩阵

| scope | 典型容器 | 创建入口 | 关键规则 |
| --- | --- | --- | --- |
| `block` | `table`、`list`、`gridCard` | `addAction` / `actions` | 对整块数据集生效 |
| `record` | `table`、`details`、`list`、`gridCard` | `addRecordAction` / `recordActions` | `details` 也属于 `recordActions` |
| `form` | `form`、`createForm`、`editForm` | `addAction` / `actions` | 表单提交类动作 |
| `filterForm` | `filterForm` | `addAction` / `actions` | `submit/reset/collapse/js` |
| `actionPanel` | `actionPanel` | `addAction` / `actions` | 不继承 collection block action 列表 |

关键规则：

- `row` 已废弃，统一使用 `record`
- `table/details/list/gridCard` 的记录级动作统一命名为 `recordActions`
- `addAction` 与 `addRecordAction` 不可互换

## Field 策略矩阵

| 容器 | 绑定字段 | 关系叶子字段 | `renderer: "js"` | standalone JS |
| --- | --- | --- | --- | --- |
| `table` | 是 | 是 | 是 | `jsColumn` |
| `details` | 是 | 是 | 是 | 否 |
| `list` | 是 | 是 | 是 | 否 |
| `gridCard` | 是 | 是 | 是 | 否 |
| `form/createForm/editForm` | 是 | 一般不建议过深叶子链 | 是 | `jsItem` |
| `filterForm` | 是 | 作为筛选字段来源 | 否 | 否 |

关键规则：

- `renderer: "js"` 不允许用于 `filterForm`
- `jsColumn` 只允许在 `table`
- `jsItem` 只允许在 `form/createForm/editForm`
- to-many 关系叶子路径如 `roles.title` 可用于 display 场景

## 执行默认值

- block 选型不确定时，先收敛用户目标，再用 `catalog.blocks` 验证
- 高级配置不确定时，先看 `configureOptions`；公开配置不够时再看 `settingsContract`
- `map/comments` 只有用户明确要求且现场 contract 允许时才创建
- JS 能力冲突时，先看现场 `catalog.fields/actions/blocks`，再决定是否暴露
