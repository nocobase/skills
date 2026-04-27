---
title: TreeBlockModel
description: 树筛选、树状筛选与层级导航树区块的路由和写法。
---

# TreeBlockModel

## 何时使用

- 用户明确说“树筛选 / 树状筛选 / 树形筛选区块 / tree filter / tree filter block”
- 用户要一个绑定数据表的层级树或树形导航区块
- 运行时 catalog 暴露 `tree` / `TreeBlockModel`

这是比“筛选区块”更具体的信号。不要先落成 `FilterFormBlockModel`，除非用户同时明确要求普通查询表单、多个字段项、提交/重置动作。

## Localized 默认写法

已有页面上增加树筛选时，优先用 `add-block`：

```json
{
  "target": { "uid": "grid-uid" },
  "type": "tree",
  "resource": {
    "dataSourceKey": "main",
    "collectionName": "users"
  },
  "settings": {
    "title": "用户树筛选",
    "searchable": true,
    "includeDescendants": true,
    "titleField": "nickname"
  }
}
```

常用 public settings：

- `title`
- `description`
- `height`
- `heightMode`
- `searchable`
- `defaultExpandAll`
- `includeDescendants`
- `titleField`
- `fieldNames`
- `pageSize`
- `dataScope`
- `sorting`

不要写 `displayTitle` 这类卡片显示键；tree runtime configure 不支持它。

## Whole-page 默认写法

整页 authoring 时，使用 public block type：

```json
{
  "key": "usersTreeFilter",
  "type": "tree",
  "collection": "users",
  "settings": {
    "title": "用户树筛选",
    "searchable": true,
    "includeDescendants": true,
    "titleField": "nickname"
  }
}
```

如果当前 blueprint/helper 尚未覆盖 `tree` 的 public shape，先查 `catalog` 证明 `TreeBlockModel` 可创建，再用 localized `add-block` 作为窄范围写入。

## 完成标准

- live readback 中存在 `use: "TreeBlockModel"`
- `resourceSettings.init.collectionName` 是用户指定的数据表
- `treeSettings` 或 `props` 中能看到要求的 `searchable` / `includeDescendants` / `titleField` 等设置
- 页面 grid layout 中包含该 tree block uid

## 常见陷阱

- 把“树筛选”误判为普通 `filterForm`
- 为了追求“筛选表单完成标准”去补 `FilterFormItemModel` / submit / reset
- 没查 live catalog 就假设实例没有 `TreeBlockModel`
- 写入 `displayTitle`，导致 `flowSurfaces configure tree does not support: displayTitle`
