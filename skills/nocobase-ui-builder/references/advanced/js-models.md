# JS Models

公开 JS 能力分四类：

- `jsBlock`
- `js` action
- `renderer: "js"` 字段
- `jsColumn` / `jsItem`

## `jsBlock`

- public key: `jsBlock`
- model use: `JSBlockModel`
- 推荐入口：`compose.blocks[].type = "jsBlock"` 或 `addblock(type="jsBlock")`
- 高频改配：`title`、`description`、`className`、`code`、`version`

## `js` action

public key 都是 `js`，但会按容器映射到不同模型：

- collection -> `JSCollectionActionModel`
- record -> `JSRecordActionModel`
- form -> `JSFormActionModel`
- filterForm -> `FilterFormJSActionModel`
- actionPanel -> `JSActionModel`

## 字段侧

- 绑定字段 JS 变体：`renderer: "js"`
- standalone table column：`type: "jsColumn"`
- standalone form item：`type: "jsItem"`

当前可保守依赖的矩阵：

- `table` / `details` -> `renderer: "js"`，落成 `JSFieldModel`
- `list` / `gridCard` -> `renderer: "js"`，落成 `JSFieldModel`
- `form` / `createForm` / `editForm` -> `renderer: "js"`，落成 `JSEditableFieldModel`
- `filterForm` -> 不支持 `renderer: "js"`
- `table` -> 支持 `jsColumn`
- `form` / `createForm` / `editForm` -> 支持 `jsItem`

## 高频配置

- `code`
- `version`
- action/button 标题类 props
- block decoratorProps

JS 相关配置优先走 `configure`；需要精确 path 时再看 contract 使用 `updateSettings`。
