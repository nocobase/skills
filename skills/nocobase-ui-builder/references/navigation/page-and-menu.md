# 页面与菜单

## 新建页面的推荐入口

优先使用：

- [../tools/createpage.md](../tools/createpage.md)

最小调用目标是先拿到：

- `pageSchemaUid`
- `tabSchemaUid`
- `gridUid`

其中后续搭建通常从 `tabSchemaUid` 或 `gridUid` 开始。

## 页面与菜单的一致性

`createpage` 做的不只是“新建一个 page model”，它同时还会：

- 创建桌面路由
- 决定页面是否显示在菜单
- 创建默认 tab route
- 让 page/header/tab 的 route 状态和 flow model 保持一致

因此不要绕开 `createpage` 自己手搓 page route。

## tab 操作

相关 tools：

- [../tools/addtab.md](../tools/addtab.md)
- [../tools/updatetab.md](../tools/updatetab.md)
- [../tools/movetab.md](../tools/movetab.md)
- [../tools/removetab.md](../tools/removetab.md)

规则：

- `moveTab` 只支持同一 page 下的兄弟 tab 排序。
- tab 的 `flowRegistry` 会同步回 route state 和 synthetic tab 读回。
- 更新 tab 标题、图标、documentTitle 时，优先走 `updatetab`，不要先想 `updateSettings`。

## 删除页面

删除整页使用：

- [../tools/destroypage.md](../tools/destroypage.md)

不要只删某一棵 flow tree 而保留 route，也不要只删 route 而留下 flow models。

## 搭建入口建议

- 空白新页面：`createpage -> catalog(tab) -> compose`
- 已有页面加一个 tab：`get(pageSchemaUid) -> addtab -> catalog(tab) -> compose`
- 页面标题/header 调整：`configure(page)` 或 `updatetab(tab)`，以目标对象为准
