# Readback Checklist

每次写入后至少检查这些点：

## 页面级

- page route 是否存在
- tab route 是否存在且顺序正确
- 页面标题、图标、documentTitle 是否同步

## 结构级

- `tree` 是否包含预期 block/field/action
- `nodeMap` 是否能找到新增节点
- popup subtree 是否挂在正确 target 下

## 字段级

- 是否拿到了 `wrapperUid/fieldUid/innerFieldUid`
- 关系字段是否写入了 `clickToOpen/openView`
- JS 字段是否落到正确的 JS model

## 操作级

- block action 和 record action 是否在正确 scope
- table 是否生成了 `actionsColumnUid`
- popup action 是否返回了 popup ids

## 配置级

- `dataScope.filter` 是否被规范化成 FilterGroup
- `flowRegistry` 是否写入成功
- layout 是否覆盖完整且无遗漏
