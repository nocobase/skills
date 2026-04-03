# Readback

本文档是写后验证的主参考文档。写后只核对本次变更直接相关的目标；只有生命周期或 route/tree 层级变化时，才升级为完整校验。`inspect` 的只读流程不在本文件定义，统一遵循 [../SKILL.md](../SKILL.md) 和 [runtime-playbook.md](./runtime-playbook.md)。

## 使用原则

- 写入后：按操作类型选最小必要读回
- 菜单操作优先核对 `routeId/type/parentMenuRouteId`
- 完整 route/tree 校验只用于 `page` / `outer-tab` / `popup-tab` 生命周期变化；菜单移动升级为菜单树读回，而不是 flow tree 校验

## 操作 -> 最小读回目标

| 操作 | 最小读回目标 | 何时升级为完整 route/tree 校验 |
| --- | --- | --- |
| `createMenu(type="group")` | 返回值；必要时菜单树读回 | 用户指定了父菜单，或后续要在该分组下继续挂接页面时 |
| `createMenu(type="item")` | 返回值 | 后续紧接 `createPage(menuRouteId=...)` 时不单独升级；如用户只要求创建菜单入口，则读菜单树确认位置 |
| `updateMenu` | 返回值；移动时读菜单树 | 改父级、按标题发现目标菜单，或需要确认最终挂接位置时 |
| `createPage` | `get({ pageSchemaUid })` | 总是升级 |
| `addTab/updateTab/moveTab/removeTab` | `page` 或对应 `outer-tab` | 总是升级 |
| `addPopupTab/updatePopupTab/movePopupTab/removePopupTab` | `popup-page` 或对应 `popup-tab` | 总是升级 |
| `compose/addBlock/addField/addAction/addRecordAction` | 直接父级 / 直接容器 target | 不升级 |
| `configure/updateSettings` | 被修改的 target | 不升级 |
| `setLayout` | 对应 grid target | 不升级 |
| `setEventFlows` | 被绑定事件流的 target，必要时再读其 popup host 或直接父级 | 不升级 |
| `apply/mutate` | 直接受影响 target；如涉及 subtree 层级变化，再读父级 | 仅结构层级真的改变时升级 |

## 生命周期读回

### 菜单

- `routeId` 是否存在且类型正确：`group` 或 `flowPage`
- `parentMenuRouteId` 是否与预期一致
- 如果改了 `title/icon/tooltip/hideInMenu`，对应 route 字段是否同步
- `createMenu(type="item")` 返回的 `pageSchemaUid/pageUid/tabSchemaUid/tabRouteId` 是否齐全
- `createMenu(type="item")` 后不要把它误判成已初始化页面；未执行 `createPage(menuRouteId=...)` 前，不校验 `gridUid`

### 页面 / `outer-tab`

- page route 是否存在
- `pageRoute.options.flowSurfacePageInitialized` 如果现场可见，是否为 `true`
- tab route 是否存在且顺序正确
- 页面或 `outer-tab` 的标题、图标、documentTitle 是否同步
- 新增 `outer-tab` 是否补齐对应 grid anchor
- `createPage(menuRouteId=...)` 后，首个 tab / grid anchor 是否已经补齐

### `popup-tab`

- popup page 是否仍存在
- popup tabs 数量与顺序是否正确
- `popup-tab` 的 `tree.use` 是否是 `ChildPageTabModel`
- 新增 `popup-tab` 是否补齐对应 grid anchor

## Popup subtree 读回

- 是否读回了 `popupPageUid`
- 是否读回了 `popupTabUid`
- popup 场景下如果现场只暴露 `tabUid`，是否已按 popup tab 兼容别名处理
- 是否读回了 `popupGridUid`
- popup 场景下如果现场只暴露 `gridUid`，是否已按 popup content 兼容别名处理
- popup subtree 是否挂在正确的 popup page/tab/grid 下
- 如果本次目标是查看或编辑当前记录，`popupGridUid` 下不能只是空 shell

## 结构读回

- 菜单场景下，不要求 `menu-group` 读出 `tree/nodeMap`
- `tree` 是否包含预期 block / field / action
- `nodeMap` 是否能找到新增节点
- table 是否生成了 `actionsColumnUid`
- block action 与 record action 是否落在正确 scope
- `recordActions.view` 场景下，popup 内容里是否实际出现了 `details`
- `recordActions.edit` 场景下，popup 内容里是否实际出现了 `editForm`
- `recordActions.edit` 场景下，`editForm` 内是否实际出现了 `submit`

## 字段读回

- 是否拿到了 `wrapperUid/fieldUid/innerFieldUid`
- 关系字段是否写入了 `clickToOpen/openView`
- JS 字段是否落到正确 JS model

## 配置读回

- 非空 `dataScope.filter` 是否被规范化成 FilterGroup
- 空筛选是否保持为 `null` 或服务端标准空表示，而不是原样 query object
- `flowRegistry` 是否写入成功
- layout 是否覆盖完整且无遗漏
- record popup 场景下，如果现场读回暴露 `resource.binding`、`filterByTk` 或同类记录上下文字段，是否已落到“当前记录”语义，而不是 collection 级语义
