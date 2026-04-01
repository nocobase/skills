# Readback

本文档定义“最小必要读回”。写后只核对本次变更直接相关的目标；只有生命周期或 route/tree 层级变化时，才升级为完整校验。

## 使用原则

- 写入后：按操作类型选最小必要读回
- 只读校验：先 `get`，需要 contract 或能力判别时再 `catalog`
- 无明确写入意图时，不要调用写接口
- 完整 route/tree 校验只用于 page / outer tab / popup child tab 生命周期变化

## 操作 -> 最小读回目标

| 操作 | 最小读回目标 | 何时升级为完整 route/tree 校验 |
| --- | --- | --- |
| `createPage` | `get({ pageSchemaUid })` | 总是升级 |
| `addTab/updateTab/moveTab/removeTab` | page 或对应 outer tab | 总是升级 |
| `addPopupTab/updatePopupTab/movePopupTab/removePopupTab` | popup page 或对应 popup child tab | 总是升级 |
| `compose/addBlock/addField/addAction/addRecordAction` | 直接宿主 target | 不升级 |
| `configure/updateSettings` | 被修改的 target | 不升级 |
| `setLayout` | 对应 grid target | 不升级 |
| `setEventFlows` | 被绑定事件流的 target，必要时再读宿主 | 不升级 |
| `apply/mutate` | 直接受影响 target；如涉及 subtree 层级变化，再读父级 | 仅结构层级真的改变时升级 |

## 生命周期读回

### 页面 / outer tab

- page route 是否存在
- tab route 是否存在且顺序正确
- 页面或 outer tab 的标题、图标、documentTitle 是否同步
- 新增 outer tab 是否补齐对应 grid anchor

### popup child tab

- popup page 是否仍存在
- popup tabs 数量与顺序是否正确
- popup child tab 的 `tree.use` 是否是 `ChildPageTabModel`
- 新增 popup child tab 是否补齐对应 grid anchor

## Popup subtree 读回

- 是否读回了 `popupPageUid`
- 是否读回了 `popupTabUid/tabUid`
- 是否读回了 `popupGridUid/gridUid`
- popup subtree 是否挂在正确的 popup page/tab/grid 下

## 结构读回

- `tree` 是否包含预期 block / field / action
- `nodeMap` 是否能找到新增节点
- table 是否生成了 `actionsColumnUid`
- block action 与 record action 是否落在正确 scope

## 字段读回

- 是否拿到了 `wrapperUid/fieldUid/innerFieldUid`
- 关系字段是否写入了 `clickToOpen/openView`
- JS 字段是否落到正确 JS model

## 配置读回

- 非空 `dataScope.filter` 是否被规范化成 FilterGroup
- 空筛选是否保持为 `null` 或服务端标准空表示，而不是原样 query object
- `flowRegistry` 是否写入成功
- layout 是否覆盖完整且无遗漏
