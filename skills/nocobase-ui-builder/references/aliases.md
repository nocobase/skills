# Aliases

本词典只负责把自然语言映射到 capability 或对象语义，不负责决定 lifecycle API、payload shape 或 readback。运行时分流看 [runtime-playbook.md](./runtime-playbook.md)，请求形状看 [tool-shapes.md](./tool-shapes.md)，record popup 与 `currentRecord` guard 看 [popup.md](./popup.md)。

使用前提：只在与 Modern page(v2) 直接相关的菜单、route-backed family 与 popup family 范围内生效；外链、移动端、通用桌面导航、工作台其它导航概念，不要强行归一到本 skill。

## 先消除 `Grid` 的歧义

- 用户在“区块 / block”语境里说 `Grid`、`Grid 区块`、`Grid block` 时，默认映射到 `gridCard`。
- 一旦用户显式点名区块类型，例如 `Grid 区块`、`表格区块`、`详情区块`，该显式区块名优先于后续展示提示。
- 用户明确说“布局 / 分栏 / 行列排布”时，才进入 layout 语义。

## 可直接映射

| 用户表达 | 默认映射 | 先检查什么 |
| --- | --- | --- |
| 菜单分组、目录、分组菜单 | `menu-group` | 是否是在说承载 Modern page(v2) 的菜单分组 |
| 菜单项、页面入口、页面菜单 | `menu-item` | 是否是在说 Modern page(v2) 的入口，而不是外链 |
| 挂到某个菜单、移到某个分组、放到某个菜单下面 | `updateMenu(parentMenuRouteId=...)` | 目标菜单是否能唯一定位到 `group` |
| 新建页面并放到菜单里 | `createMenu(type="item") + createPage(menuRouteId=...)` | 是否同时给了父菜单信息 |
| 表格、数据表、列表表格 | `table` | 当前 target 是否支持 block 创建 |
| Grid 区块、Grid block、卡片墙、卡片宫格 | `gridCard` | 是否明确是在说区块，而不是 layout |
| 详情区、详情块、只读详情 | `details` | 是否明确是单记录只读 |
| 新增表单、创建表单、录入表单 | `createForm` | 是否明确是创建记录 |
| 编辑表单、修改表单 | `editForm` | 是否明确是编辑已有记录 |
| 查看当前记录、查看本条、查看这一行 | `recordActions.view` + record popup | 是否明确是记录级按钮或行操作 |
| 编辑当前记录、编辑本条、编辑这一行 | `recordActions.edit` + record popup | 是否明确是记录级按钮或行操作 |
| 通用表单、普通表单 | `form` | 是否明确要求兼容 `FormBlockModel` |
| 说明区、帮助文案、富文本说明 | `markdown` | 当前 target 是否支持 block 创建 |
| 嵌入网页、嵌入链接、内嵌 HTML | `iframe` | 当前 target 是否支持 block 创建 |
| 图表、统计图、趋势图、报表图 | `chart` | 当前 target 是否支持 block 创建 |
| 操作面板、按钮面板 | `actionPanel` | 当前 target 是否支持 block 创建 |
| 自定义组件、自定义渲染块、代码区块 | `jsBlock` | 当前 target 是否支持 block 创建 |
| 刷新、重新加载 | `refresh` | 是否位于 block action scope |
| 批量删 | `bulkDelete` | 是否位于 block action scope |
| JS 代码、运行时代码 | JS 能力 | 当前 block/field/action 是否支持 JS |

## 先按上下文收敛

| 用户表达 | 默认先按什么收敛 | 什么时候必须停下来确认 | 可能落点 |
| --- | --- | --- | --- |
| 页面 | 有现成 locator/uid 时先按已有 `page` 处理；明确“新建页面”且带菜单语境时，默认走菜单优先链路 | 同时存在“新建页面”和“修改已有页面”两种解释 | `menu-item` / `page` |
| 页面入口、菜单、导航项 | 先判断是在说 `menu-group`、`menu-item`，还是已初始化 `page` | 可能是在说外链、移动端或工作台其它导航 | `menu-group` / `menu-item` / `page` |
| 列表、列表页 | 先默认 `table` | 用户同时强调“轻量/移动端/卡片” | `table` / `list` / `gridCard` |
| 工具栏、工具区 | collection block 上先看 block actions；明确要独立按钮区时再看 `actionPanel` | block actions 与独立按钮区都说得通 | `actions` / `actionPanel` |
| 标签页、页签、tab | page route 上下文时先按 `outer-tab`；popup subtree 上下文时先按 `popup-tab` | 只有自然语言“tab”，没有 page/popup 上下文 | `outer-tab` / `popup-tab` |
| 打开详情、点击打开 | 字段语境先按 `openView`；记录按钮语境先按 `recordActions.view` | 字段和动作来源都不清楚 | `openView` / `recordActions.view` |
| 当前记录、本条记录、这一行 | 先按 record scope 收敛；popup 详情/编辑语境下默认走 record popup | 同时可能指“当前页面主记录”和“table 当前行” | `recordActions.*` / record popup |
| 抽屉打开、弹窗打开、自定义弹窗 | 字段来源优先 `openView`；action 来源优先 popup action | 触发源不清楚 | field `openView` / popup action |
| 重置、清空 | 搜索 / 筛选 / 条件语境下先按 `filterForm.reset` | 可能是在说清空表单内容、清空布局或清空数据 | `reset` / 其他清空动作 |

## 映射后的保守动作

- 映射只决定 capability 或对象语义，不决定具体 API、请求 envelope 或 readback。
- 菜单表达如果只给标题，必须先做菜单树发现；只有唯一命中的 `group` 才能继续写入。
- 只要会跨 family 或跨 action scope，就先收敛目标，不要直接生成写请求。
