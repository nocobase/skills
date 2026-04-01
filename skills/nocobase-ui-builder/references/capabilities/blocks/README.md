# Blocks

按区块职责选 block，而不是先想着底层 model use。

## 默认可创建 block

- collection blocks
  - 表格区块：[table.md](./table.md)
  - 新增表单：[create-form.md](./create-form.md)
  - 编辑表单：[edit-form.md](./edit-form.md)
  - 详情区块：[details.md](./details.md)
  - 筛选区块：[filter-form.md](./filter-form.md)
  - 列表区块：[list.md](./list.md)
  - 卡片网格区块：[grid-card.md](./grid-card.md)
- static blocks
  - Markdown 说明区：[markdown.md](./markdown.md)
  - Iframe 嵌入区：[iframe.md](./iframe.md)
  - 图表区块：[chart.md](./chart.md)
  - 操作面板：[action-panel.md](./action-panel.md)
- JS block
  - 自定义 JS 区块：[js-block.md](./js-block.md)

## 兼容但不默认推荐

- 通用表单：[form.md](./form.md)
  - `FormBlockModel` 目前仍可创建，但不是 formal builtin。
  - 默认优先 `createForm` 或 `editForm`。

## 只读/边界说明

- 地图区块：[map.md](./map.md)
- 评论区块：[comments.md](./comments.md)

这两类 block 不提供默认 happy-path；是否可创建、如何配置，以现场 `catalog/get` 为准。

## 选型原则

- 面向数据表格操作时，优先 `table`。
- 面向单条记录详情时，优先 `details`，不要用只读表单硬模拟。
- 面向新增/编辑流程时，优先 `createForm` / `editForm`，不要先选通用 `form`。
- 面向列表卡片浏览时，在 `list` 和 `gridCard` 中选一个，不要为了“像列表”仍硬用 table。
- 需要静态说明区时，优先 `markdown` 而不是滥用 `jsBlock`。
- 需要嵌外部页面或 HTML 时，优先 `iframe`。
- 需要很多工具按钮但不一定绑定某个 collection block 时，优先 `actionPanel`。
- 只有当用户明确要求自定义运行时代码或现场已存在 JS block 时，才优先 `jsBlock`。
