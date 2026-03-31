# Grid Card Block

`gridCard` 是卡片网格型的 collection block。

## 适用场景

- 商品、成员、作品、图库等卡片浏览
- 需要响应式列数
- 每个 card 上有少量记录操作

## 公开语义

- `fields`
  - card 内展示字段
- `actions`
  - block 顶部动作
- `recordActions`
  - 单个 card 的记录操作

## 高频配置

- `columnCount`
- `rowCount`
- `dataScope`
- `defaultSorting`
- `layout`

## 适合的 record actions

- `view`
- `edit`
- `popup`
- `updateRecord`
- `delete`
- `templatePrint`
- `triggerWorkflow`
- `js`

如果用户明确说“卡片墙”“宫格卡片”“缩略图卡片列表”，优先映射到 `gridCard`。
