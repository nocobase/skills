# Blocks

按区块职责选 block，而不是先想着底层 model use。默认可创建 / 兼容使用 / 保守维护策略统一看 [../../runtime-truth/capability-matrix.md](../../runtime-truth/capability-matrix.md)。

## 高优先级 block 文档

- 表格区块：[table.md](./table.md)
- 新增表单：[create-form.md](./create-form.md)
- 编辑表单：[edit-form.md](./edit-form.md)
- 详情区块：[details.md](./details.md)
- 筛选区块：[filter-form.md](./filter-form.md)
- 列表区块：[list.md](./list.md)
- 卡片网格区块：[grid-card.md](./grid-card.md)

## 其他常见 block

- 简单 / 静态 / 非默认创建能力汇总：[simple-blocks.md](./simple-blocks.md)
- 自定义 JS 区块：[js-block.md](./js-block.md)

## 兼容但不默认推荐

- 通用表单：[form.md](./form.md)
  - `FormBlockModel` 目前仍可创建，但不属于默认推荐的标准 block 创建路径。
  - 默认优先 `createForm` 或 `editForm`。

## 选型原则

- 面向数据表格操作时，优先 `table`。
- 面向单条记录详情时，优先 `details`，不要用只读表单硬模拟。
- 面向新增/编辑流程时，优先 `createForm` / `editForm`，不要先选通用 `form`。
- 面向列表卡片浏览时，在 `list` 和 `gridCard` 中选一个，不要为了“像列表”仍硬用 table。
- 需要静态说明、嵌入内容、图表或工具面板时，看 [simple-blocks.md](./simple-blocks.md)。
- 只有当用户明确要求自定义运行时代码或现场已存在 JS block 时，才优先 `jsBlock`。
