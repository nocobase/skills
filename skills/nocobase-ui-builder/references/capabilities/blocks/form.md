# Form Block

`form` 对应 `FormBlockModel`，目前仍可创建，但不属于默认推荐的标准内建 block 类型。

## 适用场景

- 读回中已经存在 `FormBlockModel`
- 用户明确要求“通用表单”，且不想区分新增/编辑
- 需要兼容历史 surface

## 默认决策

- 新建页面时默认不要先选它。
- 能明确是新增还是编辑时，优先 `createForm` / `editForm`。

## 公开语义

- `fields`
- `actions`

## 高频配置

- `layout`
- `labelAlign`
- `labelWidth`
- `labelWrap`
- `colon`
- `assignRules`

## 关键约束

- 这是兼容能力，不是推荐首选。
- 任何写入前仍然要先看现场 `catalog(target)`，不要假设它和 `createForm/editForm` 完全等价。
