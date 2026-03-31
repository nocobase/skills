# Form And Filter Actions

表单相关动作分两类：

## form actions

适用容器：

- `form`
- `createForm`
- `editForm`

高频 action：

- `submit`
- `triggerWorkflow`
- `js`

## filter-form actions

适用容器：

- `filterForm`

高频 action：

- `submit`
- `reset`
- `collapse`
- `js`

## 作用速查

| action | 作用 |
| --- | --- |
| `submit` | 普通 form 中提交表单；filterForm 中执行筛选 |
| `reset` | 重置 filterForm 条件 |
| `collapse` | 折叠/展开 filterForm 的高级筛选行 |
| `triggerWorkflow` | 表单提交相关的工作流触发 |
| `js` | 自定义表单动作 |

## 注意点

- `submit` 在普通 form 和 filterForm 是两个不同 scope 的公开能力。
- `collapse` 只属于 filterForm。
- 如果用户说“搜索”“筛选”“重置条件”，优先映射到 filter-form action，而不是普通 form action。
