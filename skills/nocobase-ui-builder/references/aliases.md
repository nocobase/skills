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

## 标题 / 图标

- 默认猜测顺序：**先看可见位置线索，再看对象名，再看 route-backed page 的默认入口语义**。
- 提到 `左侧`、`菜单`、`导航`、`菜单标题`、`菜单图标`、`分组标题` 时，优先收敛到 `menu-group` / `menu-item`。
- 提到 `页签`、`tab`、`标签` 时，优先收敛到 `outer-tab` / `popup-tab`。
- 提到 `页面顶部标题`、`页头标题`、`header 标题`、`内容区标题` 时，优先收敛到 `page`。
- 提到 `页面顶部图标`、`页头图标`、`header icon` 时，不要直接承诺可见效果；先检查 page header 渲染链是否真的消费 `icon`。
- 只说 `页面标题`、`页面图标`，但没有位置线索时：如果目标是 route-backed page，默认先按**页面入口**处理，也就是 `menu-item -> updateMenu`，不要直接默认成 `outer-tab -> updateTab`。
- 只说 `给页面标题加图标` 时，不要直接猜成 `updateTab`；如果明确是在说 page header icon，先查渲染链；如果没有位置线索，默认按页面入口图标处理，并在 commentary 里声明这是默认猜测。
- 同一句里如果同时出现互相冲突的位置线索，例如同时提到 `左侧菜单` 和 `tab 标题`，就停止默认猜测，先收敛目标。

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
- Prompt 回归样例统一看 [runtime-playbook.md](./runtime-playbook.md)。
