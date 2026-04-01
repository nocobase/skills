# Popup And OpenView

popup 相关能力主要出现在三处：

- action popup
- 关系字段 `openView`
- popup surface 内继续 `compose`
- popup child tab lifecycle

## 常见返回 uid

- `popupPageUid`
- `popupTabUid`
- `popupGridUid`
- `tabUid`（来自 `addPopupTab` 返回值）

## 推荐顺序

1. 先创建会打开 popup 的 action 或 field
2. 优先复用返回值中的 `popupPageUid/popupTabUid/popupGridUid`
3. 如果只有宿主 uid，先 `get(hostUid)` 拿到 popup 相关 uid
4. 在 popup target 上继续 `compose`
5. 如需 popup child tab lifecycle，走 `addPopupTab/updatePopupTab/movePopupTab/removePopupTab`
6. 如需更细配置，再 `configure` 或 `updateSettings`

## 字段 openView

常见简单改法是：

- `clickToOpen`
- `openView.mode`
- `openView.collectionName`

## 风险点

- 如果 popup settings 被清空，但仍保留引用 `popupSettings.openView` 的 flow，会失败。
- popup surface 与顶层 page/tab 不是同一个作用域，不要混用 locator。
- popup child tab 与 route-backed tab 不是同一套生命周期 API，不要混用 `addTab/removeTab`。
- `popupTabUid` 和 `tabUid` 都表示 popup child tab 的 canonical uid；字段名取决于返回它的是 popup-capable 宿主写接口还是 `addPopupTab`。
