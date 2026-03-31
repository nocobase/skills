# Fields

字段选择要先看容器，再看字段类型，再看是否需要 JS 变体。

## 目录

- 绑定字段：[bound-field.md](./bound-field.md)
- 关系叶子字段：[relation-leaf.md](./relation-leaf.md)
- JS 字段能力：[js-models.md](./js-models.md)

## 基本规则

- table/details/list/gridCard 以 display 字段为主。
- form/createForm/editForm 以 editable 字段为主。
- filterForm 以 filter 字段为主。
- `renderer: "js"` 是“绑定字段的 JS 变体”，不是 standalone field type。
- `jsColumn` 和 `jsItem` 是 standalone field type。

## 先问这三个问题

1. 这个字段是绑定 collection field，还是纯运行时字段？
2. 它落在哪种容器里？
3. 它是否需要 `clickToOpen/openView`、JS 渲染或特殊 target？
