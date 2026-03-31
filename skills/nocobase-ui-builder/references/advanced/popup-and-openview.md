# Popup And OpenView

popup 相关能力主要出现在三处：

- action popup
- 关系字段 `openView`
- popup surface 内继续 `compose`

## 常见返回 uid

- `popupPageUid`
- `popupTabUid`
- `popupGridUid`

## 推荐顺序

1. 先创建会打开 popup 的 action 或 field
2. 读回拿到 popup 相关 uid
3. 在 popup target 上继续 `compose`
4. 如需更细配置，再 `configure` 或 `updateSettings`

## 字段 openView

常见简单改法是：

- `clickToOpen`
- `openView.mode`
- `openView.collectionName`

## 风险点

- 如果 popup settings 被清空，但仍保留引用 `popupSettings.openView` 的 flow，会失败。
- popup surface 与顶层 page/tab 不是同一个作用域，不要混用 locator。
