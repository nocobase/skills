# Aliases

当用户只给自然语言表达、还没能唯一落到 target family 或 capability 时，读本文。本文只处理高歧义词的语义收敛；API 选择看 [runtime-playbook.md](./runtime-playbook.md)，请求形状看 [tool-shapes.md](./tool-shapes.md)，record popup 与 `currentRecord` guard 看 [popup.md](./popup.md)。

## `Grid`

- 用户在“区块 / block”语境里说 `Grid`、`Grid 区块`、`Grid block` 时，默认映射到 `gridCard`。
- 用户明确说“布局 / 分栏 / 行列排布”时，才进入 layout 语义。
- 一旦用户显式点名区块类型，例如 `表格区块`、`详情区块`、`Grid 区块`，显式区块名优先。

## 页面 / 页面入口

| 用户表达 | 默认先按什么收敛 | 什么时候必须停下来确认 | 可能落点 |
| --- | --- | --- | --- |
| 页面 | 有现成 locator/uid 时先按已有 `page` 处理；明确“新建页面”且带菜单语境时默认走菜单优先链路 | 同时存在“新建页面”和“修改已有页面”两种解释 | `menu-item` / `page` |
| 页面入口、菜单、导航项 | 先判断是在说 `menu-group`、`menu-item`，还是已初始化 `page` | 可能是在说外链、移动端或工作台其它导航 | `menu-group` / `menu-item` / `page` |

## `tab`

- page route 上下文时先按 `outer-tab`。
- popup subtree 上下文时先按 `popup-tab`。
- 只有自然语言“tab”，没有 page/popup 上下文时，先用 `get(...).tree.use` 或 uid 来源收敛；仍不清楚就停止猜测。

## 点击打开 / 打开详情

- 字段语境先按 `openView`。
- 记录按钮、行操作语境先按 `recordActions.view` / `recordActions.edit` + record popup。
- 如果字段和动作来源都不清楚，先停止并收敛触发源，不要直接生成写请求。

## 当前记录

- `当前记录 / 本条记录 / 这一行` 默认先按 record scope 收敛，popup 详情/编辑语境下优先考虑 record popup。
- 只有在 live `catalog.blocks[].resourceBindings` 明确暴露 `currentRecord` 时，才继续创建 `details(currentRecord)` 或 `editForm(currentRecord)`。
- 不要把 `currentRecord` 当成 locator、`target.uid`，也不要把它当成页面上已有区块实例的隐式状态。

## 重置 / 清空

- 搜索 / 筛选 / 条件语境下，优先按 `filterForm.reset`。
- 如果也可能是在说清空表单内容、清空布局或清空数据，先停止并收敛语义。

## 保守动作

- alias 只决定对象语义或 capability，不决定具体 API、payload shape 或 readback。
- 菜单表达如果只给标题，必须先做菜单树发现；只有唯一命中的 `group` 才能继续写入。
- 只要会跨 family 或跨 action scope，就先收敛目标，不要直接生成写请求。
