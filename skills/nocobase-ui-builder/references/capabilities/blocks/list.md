# List Block

`list` 适合轻量 item 浏览，不适合 table 那种重操作密度场景。

## 适用场景

- 卡片化程度不高，但希望比 table 更轻
- 需要 item 级展示与 item 级记录操作
- 移动端友好的浏览页面

## 公开语义

- `fields`
  - item 内展示字段
- `actions`
  - block 顶部动作
- `recordActions`
  - item 级动作

## 高频 block actions

- `filter`
- `addNew`
- `popup`
- `refresh`
- `triggerWorkflow`
- `js`

## 高频 record actions

- `view`
- `edit`
- `popup`
- `delete`
- `updateRecord`
- `templatePrint`
- `triggerWorkflow`
- `js`

## 高频配置

- `pageSize`
- `dataScope`
- `defaultSorting`
- `layout`

如果用户想要“列表 + 每项按钮”，优先考虑 `list`，不要默认 table。
