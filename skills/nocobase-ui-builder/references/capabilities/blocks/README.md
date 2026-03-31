# Blocks

按区块职责选 block，而不是先想着底层 model use。

## 目录

- 表格区块：[table.md](./table.md)
- 筛选区块：[filter-form.md](./filter-form.md)
- 列表区块：[list.md](./list.md)
- 卡片网格区块：[grid-card.md](./grid-card.md)

## 其他常用 block

- `createForm` / `editForm` / `form`
  - 用于表单录入或编辑。
- `details`
  - 用于单条记录详情展示。
- `markdown`
  - 纯文本/说明性内容。
- `iframe`
  - 嵌入 URL 或 HTML。
- `chart`
  - 图表展示，配置通常走 `chartSettings`。
- `actionPanel`
  - 放置工具按钮、触发工作流、JS action。
- `jsBlock`
  - 自定义 JS 区块。

## 当前不应当作默认创建能力的 block

- `map`
  - 可读回，但 `createSupported = false`。
- `comments`
  - 可读回，但 `createSupported = false`。

## 选型原则

- 面向数据表格操作时，优先 `table`。
- 面向列表卡片浏览时，在 `list` 和 `gridCard` 中选一个，不要为了“像列表”仍硬用 table。
- 需要静态说明区时，优先 `markdown` 而不是滥用 `jsBlock`。
- 需要很多工具按钮但不一定绑定某个 collection block 时，优先 `actionPanel`。
