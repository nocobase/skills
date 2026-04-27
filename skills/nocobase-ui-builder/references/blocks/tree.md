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

新增 tree 时如果要立刻连接已有数据区块，直接在 `settings.connectFields` 写 live uid：

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
    "connectFields": {
      "targets": [
        { "targetId": "users-table-uid" }
      ]
    }
  }
}
```

已有 tree 后续调整连接时，用 `configure changes.connectFields`：

```json
{
  "target": { "uid": "tree-uid" },
  "changes": {
    "connectFields": {
      "targets": [
        { "targetId": "users-table-uid", "filterPaths": ["department.id"] }
      ]
    }
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
- `connectFields`

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

整页新增树筛选并连接同一 blueprint 内的数据区块时，优先在 `applyBlueprint` 阶段写 `settings.connectFields`，目标使用 same-blueprint block key：

```json
{
  "key": "usersTreeFilter",
  "type": "tree",
  "collection": "users",
  "settings": {
    "title": "用户树筛选",
    "connectFields": {
      "targets": [
        { "target": "usersTable" }
      ]
    }
  }
}
```

如果当前 blueprint/helper 尚未覆盖 `tree` 的 public shape，先查 `catalog` 证明 `TreeBlockModel` 可创建，再用 localized `add-block` 作为窄范围写入。

## 连接数据区块规则

- Public API 只写 `settings.connectFields` 或 `changes.connectFields`；不要直接写 raw `filterManager`。
- Blueprint / `applyBlueprint` / same-run `compose` 使用 `target`，值是同一次 payload 内的 block key。
- Live localized `addBlock` / `configure` 使用 `targetId`；兼容低层 live uid 写法 `targetBlockUid`。
- 目标必须是支持筛选的数据区块：table / list / gridCard / calendar / kanban / details / chart / map / comments / tree。
- localized preflight 对 live 连接 fail-closed：`targetId` / `targetBlockUid` 必须能在 `collectionMetadata.liveTopology.byUid` 中解析到 tree/source 与目标区块，并且相关 collection metadata 必须存在。
- `titleField` 只控制树节点展示；实际筛选值来自树 key，默认是 source collection 的 `filterTargetKey[0] || "id"`。
- 同 collection 连接时 `filterPaths` 可省略，服务端默认使用目标 collection 的 `filterTargetKey[0] || "id"`。
- 跨 collection 连接时 `filterPaths` 必填，例如 `["department.id"]`。
- `filterPaths` 字段类型必须和树 key 类型兼容；例如树 key 是 bigint `id` 时，不能连接到 varchar/select 字段 `intelType`，preflight 会以 `tree-connect-filter-path-type-mismatch` 拒绝。
- 同一个 tree 的 `targets` 里不能重复写同一个目标；需要调整字段时保留一条目标配置并写最终 `filterPaths`。
- 如果需求是真正“按情报类型/枚举值筛选全部同类型记录”，不要把 Tree 的 `titleField: "intelType"` 误当成筛选值；优先用普通字段筛选，或建立独立类型 collection/自定义 Tree 能力，让树 key 本身就是类型值。
- `targets: []` 清空当前 tree 的全部连接，不影响其他筛选区块。

## 完成标准

- live readback 中存在 `use: "TreeBlockModel"`
- `resourceSettings.init.collectionName` 是用户指定的数据表
- `treeSettings` 或 `props` 中能看到要求的 `searchable` / `includeDescendants` / `titleField` 等设置
- 页面 grid layout 中包含该 tree block uid
- 连接数据区块时，前端“连接数据区块”设置可读到 `settings.connectFields` 写入后落在 grid `filterManager` 的 tree -> target 绑定

## 常见陷阱

- 把“树筛选”误判为普通 `filterForm`
- 为了追求“筛选表单完成标准”去补 `FilterFormItemModel` / submit / reset
- 没查 live catalog 就假设实例没有 `TreeBlockModel`
- 写入 `displayTitle`，导致 `flowSurfaces configure tree does not support: displayTitle`
- 为了连接目标表格直接写 `filterManager`；public 写法应是 tree 的 `settings.connectFields`
- 设置 `titleField: "intelType"` 后又写 `filterPaths: ["intelType"]`，以为点击树节点会按该文本筛选；默认 Tree 仍会返回 `id`，会造成 varchar = bigint 类型错误
