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
- `gridUid`（来自 `addPopupTab` 返回值，与 `popupGridUid` 同一语义域）

## 推荐顺序

1. 先创建会打开 popup 的 action 或 field
2. 优先复用返回值中的 `popupPageUid/popupTabUid/popupGridUid`
3. 如果只有宿主 uid，先 `get({ uid: hostUid })` 拿到 popup 相关 uid
4. 先确认本次要写的是 `popupPageUid`、`popupTabUid` / `tabUid` 还是 `popupGridUid` / `gridUid`
5. 在对应 popup target 上先 `catalog`
6. 再 `compose/configure/add*`
7. 如需更细配置，再 `updateSettings`

## popup child tab lifecycle

- 新增：`addPopupTab(target.uid=popupPageUid)`
- 更新：`updatePopupTab(target.uid=popupTabUid 或 tabUid)`
- 排序：`movePopupTab(sourceUid=popupTabUid 或 tabUid, targetUid=popupTabUid 或 tabUid)`
- 删除：`removePopupTab(target.uid=popupTabUid 或 tabUid)`
- 如果新增后还要继续写内容，对返回的 `gridUid` 再 `catalog`

## 字段 openView

常见简单改法是：

- `clickToOpen`
- `openView.mode`
- `openView.collectionName`

## 风险点

- 如果 popup settings 被清空，但仍保留引用 `popupSettings.openView` 的 flow，会失败。
- popup surface 与顶层 page/tab 不是同一个作用域，不要混用 locator。
- 已有 popup subtree 写入不要跳过 `catalog`；popup target 的能力和 settings contract 仍要现场确认。
- popup child tab 与 route-backed tab 不是同一套生命周期 API，不要混用 `addTab/removeTab`。
- `popupTabUid` 和 `tabUid` 都表示 popup child tab 的 canonical uid；`popupGridUid` 和 `gridUid` 都表示 popup 内容区 uid；字段名取决于返回它的是 popup-capable 宿主写接口还是 `addPopupTab`。
