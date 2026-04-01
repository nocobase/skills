# Readback Checklist

按变更类型选择最小必要读回，不要每次都做同样重的全量检查。

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

- 是否拿到了或读回了 `popupPageUid/popupTabUid/popupGridUid`
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

- `dataScope.filter` 是否被规范化成 FilterGroup
- `flowRegistry` 是否写入成功
- layout 是否覆盖完整且无遗漏
