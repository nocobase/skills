# JS Capabilities

公开 JS 能力分四类：

- `jsBlock`
- `js` action
- `renderer: "js"` 字段
- standalone JS 字段：`jsColumn` / `jsItem`

详细容器支持矩阵统一看 [../runtime-truth/capability-matrix.md](../runtime-truth/capability-matrix.md)。

## `jsBlock`

- public key：`jsBlock`
- model use：`JSBlockModel`
- 推荐入口：`compose.blocks[].type = "jsBlock"` 或 `addBlock(type="jsBlock")`
- 高频改配：`title`、`description`、`className`、`code`、`version`

## `js` action

public key 都是 `js`，但会按容器映射到不同模型：

- collection -> `JSCollectionActionModel`
- record -> `JSRecordActionModel`
- form -> `JSFormActionModel`
- filterForm -> `FilterFormJSActionModel`
- actionPanel -> `JSActionModel`

## 字段侧 JS 能力

### 绑定字段的 JS 变体

```json
{
  "fieldPath": "nickname",
  "renderer": "js"
}
```

含义：

- 仍然绑定真实字段
- inner field 会映射到 JS field model

### standalone JS 字段

- `jsColumn`
  - 只允许在 table
  - 是 standalone field，不绑定真实 `fieldPath`
- `jsItem`
  - 只允许在 `form/createForm/editForm`
  - 是 standalone field

## 当前可保守依赖的字段矩阵

- `table` / `details` -> `renderer: "js"`
- `list` / `gridCard` -> `renderer: "js"`
- `form` / `createForm` / `editForm` -> `renderer: "js"`
- `filterForm` -> 不支持 `renderer: "js"`
- `table` -> 支持 `jsColumn`
- `form` / `createForm` / `editForm` -> 支持 `jsItem`

## 高频配置

- `code`
- `version`
- action/button 标题类 props
- block decoratorProps
- `jsColumn` 常见：`title`、`width`、`fixed`
- `jsItem` 常见：`label`、`showLabel`

## 关键约束

- JS 相关配置优先走 `configure`；需要精确 path 时再看 contract 使用 `updateSettings`
- `renderer: "js"` 不是 standalone field type
- `jsColumn` 和 `jsItem` 才是 standalone field type
