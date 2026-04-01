# Capability Policy

本文档只定义策略标签与少数例外，不承载 block/action/field/js 的矩阵。具体选型分别看 [blocks.md](./blocks.md)、[forms.md](./forms.md)、[actions.md](./actions.md)、[fields.md](./fields.md)、[js.md](./js.md)。

## 默认策略怎么执行

- **默认可创建**：可直接创建；仍需以现场 `catalog` 暴露能力为准
- **兼容使用**：只有用户明确要求，且 `catalog` 已暴露能力时才创建
- **保守维护**：默认不创建；只做读回、公开改配或 contract 已明确的小范围修复
- **create = 现场确认**：必须先 `catalog` 确认 contract，再决定是否创建

## 默认策略映射

- 默认可创建：
  - `table`
  - `createForm`
  - `editForm`
  - `details`
  - `filterForm`
  - `list`
  - `gridCard`
  - `markdown`
  - `iframe`
  - `chart`
  - `actionPanel`
  - `jsBlock`
- 兼容使用：
  - `form`
- 保守维护 / create = 现场确认：
  - `map`
  - `comments`

动作、字段和 JS 能力本身不在这里重列矩阵；以 topical docs 和现场 `catalog` 暴露为准。

## 策略例外

- block 选型不确定时，先收敛用户目标，再用 `catalog.blocks` 验证
- 高级配置不确定时，先看 `configureOptions`；公开配置不够时再看 `settingsContract`
- `form` 只在用户明确要求兼容 `FormBlockModel`，或现场已经存在对应历史形态时再创建
- `map/comments` 只有用户明确要求且现场 contract 允许时才创建
- `filterForm` 默认筛选目标是 `table/details/list/gridCard`；`chart` 是否可作为 target 以 [blocks.md](./blocks.md) 的保守条件为准
- JS 能力冲突时，以现场 `catalog.fields/actions/blocks` 暴露为准
