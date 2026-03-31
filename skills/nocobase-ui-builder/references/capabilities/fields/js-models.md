# JS Fields

JS 字段能力分三类：

## 1. 绑定字段的 JS 变体

```json
{
  "fieldPath": "nickname",
  "renderer": "js"
}
```

含义：

- 仍然绑定真实字段
- inner field 会映射到 JS field model

规则：

- `table/details` 支持
- `form/createForm/editForm` 支持
- `filterForm` 不支持

## 2. `jsColumn`

```json
{
  "type": "jsColumn"
}
```

规则：

- 只允许在 table
- 是 standalone field，不绑定真实 fieldPath

## 3. `jsItem`

```json
{
  "type": "jsItem"
}
```

规则：

- 只允许在 `form/createForm/editForm`
- 是 standalone field

## 高频配置

- `code`
- `version`
- 对 `jsColumn` 还常见：`title`、`width`、`fixed`
- 对 `jsItem` 还常见：`label`、`showLabel`

更完整的 JS block / JS action / JS field 指南见：

- [../../advanced/js-models.md](../../advanced/js-models.md)
