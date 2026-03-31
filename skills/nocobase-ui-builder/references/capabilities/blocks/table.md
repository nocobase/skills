# Table Block

`table` 是最重要的 collection block，也是本 skill 首版验证重点。

## 适用场景

- 记录浏览、筛选、排序、分页
- 批量操作
- 行内记录级操作
- 树表
- 需要列级宽度、固定列、actions column 的场景

## 必备输入

通常至少需要：

```json
{
  "type": "table",
  "resource": {
    "dataSourceKey": "main",
    "collectionName": "users"
  }
}
```

## 公开语义

- `fields`
  - 表格列
- `actions`
  - block 级操作
- `recordActions`
  - 行级操作

不要把 `recordActions` 写到 `actions` 里。

## 高频 block actions

- `filter`
- `addNew`
- `refresh`
- `expandCollapse`
- `bulkDelete`
- `bulkEdit`
- `bulkUpdate`
- `export`
- `exportAttachments`
- `import`
- `link`
- `upload`
- `composeEmail`
- `templatePrint`
- `triggerWorkflow`
- `js`

## 高频 record actions

- `view`
- `edit`
- `popup`
- `delete`
- `updateRecord`
- `duplicate`
- `addChild`
- `composeEmail`
- `templatePrint`
- `triggerWorkflow`
- `js`

## 高频配置

优先使用 `configure` 暴露的简单 changes：

- `pageSize`
- `dataScope`
- `defaultSorting`
- `quickEdit`
- `showRowNumbers`
- `treeTable`
- `defaultExpandAllRows`
- `tableDensity`
- `dragSort`
- `dragSortBy`

## 常见组合

- `filterForm + table`
  - 最常见双栏页面。
- `table + details popup`
  - 行级查看。
- `table + createForm popup`
  - block 级新增。
- `treeTable + addChild`
  - 分层数据。
- `table + jsColumn`
  - 自定义运行时列。

## 关键读回点

- `actionsColumnUid`
- 每个字段的 `wrapperUid/fieldUid`
- 关系字段是否启用了 `clickToOpen/openView`
- block actions 和 recordActions 是否落在正确容器
