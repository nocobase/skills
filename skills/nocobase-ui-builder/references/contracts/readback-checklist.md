# Readback Checklist

这里放“怎么验”的规范。它既用于写后读回，也用于用户只要求 review / audit / 校验时的只读检查。

按变更类型选择最小必要读回，不要每次都做同样重的全量检查。

## 使用原则

- 写入后：按这份清单选择与本次变更直接相关的检查项。
- 只读校验 / review：先 `get`，必要时再 `catalog`，然后按对应条目断言；无明确写入意图时不要调用写接口。
- `最小必要读回` 指至少读回直接受影响的 target，或它的宿主 / 父级 target，并核对本次变更涉及的结构、配置或 route 字段。
- 只有 page / tab / popup target 层级变化、route 同步或生命周期变更时，才升级为完整 route/tree 校验。

## 页面 / Route-Backed Tab 生命周期

- page route 是否存在
- tab route 是否存在且顺序正确
- 页面或外层 tab 的标题、图标、documentTitle 是否同步
- 新增 tab 是否补齐了对应 grid anchor

## Popup Child Tab 生命周期

- popup page 是否仍存在
- popup tabs 数量与顺序是否正确
- popup child tab 的 `tree.use` 是否是 `ChildPageTabModel`
- 新增 popup child tab 是否补齐了对应 grid anchor

## Popup Subtree

- 是否拿到了或读回了 `popupPageUid`
- 是否拿到了或读回了 `popupTabUid / tabUid`
- 是否拿到了或读回了 `popupGridUid / gridUid`
- popup subtree 是否挂在正确 popup page/tab/grid 下

## Block / Field / Action 结构

- `tree` 是否包含预期 block/field/action
- `nodeMap` 是否能找到新增节点
- table 是否生成了 `actionsColumnUid`
- block action 和 record action 是否在正确 scope

## 字段细节

- 是否拿到了 `wrapperUid/fieldUid/innerFieldUid`
- 关系字段是否写入了 `clickToOpen/openView`
- JS 字段是否落到正确的 JS model

## 配置改动

- 非空 `dataScope.filter` 是否被规范化成 FilterGroup
- 空筛选是否保持为 `null` 或服务端标准空表示，而不是原样 query object
- `flowRegistry` 是否写入成功
- layout 是否覆盖完整且无遗漏
