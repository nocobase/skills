# Aliases

本词典只负责把自然语言映射到 capability 或对象语义，不负责决定 lifecycle API、payload shape 或 readback。运行时分流看 [runtime-playbook.md](./runtime-playbook.md)，请求形状看 [tool-shapes.md](./tool-shapes.md)。record popup 的 guard 与默认填充顺序统一看 [popup-and-event-flow.md](./popup-and-event-flow.md)。

使用前提：

- 只在与 Modern page(v2) 直接相关的菜单、route-backed family 与 popup family 范围内生效
- 外链、移动端、通用桌面导航、工作台其它导航概念，不要强行归一到本 skill

## Default heuristic：可直接映射

| 用户表达 | 默认映射 | 先检查什么 |
| --- | --- | --- |
| 菜单分组、目录、分组菜单 | `menu-group` | 是否是在说承载 Modern page(v2) 的菜单分组 |
| 菜单项、页面入口、页面菜单 | `menu-item` | 是否是在说 Modern page(v2) 的入口，而不是外链 |
| 挂到某个菜单、移到某个分组、放到某个菜单下面 | `updateMenu(parentMenuRouteId=...)` | 目标菜单是否能唯一定位到 `group` |
| 新建页面并放到菜单里 | `createMenu(type="item") + createPage(menuRouteId=...)` | 是否同时给了父菜单信息 |
| 表格、数据表、列表表格 | `table` | 当前 target 是否支持 block 创建 |
| 筛选区、过滤区、搜索表单、过滤表单 | `filterForm` | 是否存在可筛选目标 block |
| 卡片墙、卡片宫格、网格卡片、名片墙 | `gridCard` | 当前 target 是否支持 block 创建 |
| 详情区、详情块、只读详情 | `details` | 是否明确是只读详情 |
| 新增表单、创建表单、录入表单 | `createForm` | 是否明确是创建记录 |
| 编辑表单、修改表单 | `editForm` | 是否明确是编辑已有记录 |
| 查看当前记录、查看本条、查看这一行 | `recordActions.view` + record popup（默认详情链，见 recipe） | 是否明确是记录级按钮或行操作 |
| 编辑当前记录、编辑本条、编辑这一行 | `recordActions.edit` + record popup（默认编辑链，见 recipe） | 是否明确是记录级按钮或行操作 |
| 通用表单、普通表单 | `form` | 是否明确要求兼容 `FormBlockModel` |
| 说明区、帮助文案、富文本说明 | `markdown` | 当前 target 是否支持 block 创建 |
| 嵌入网页、嵌入链接、内嵌 HTML | `iframe` | 当前 target 是否支持 block 创建 |
| 图表、统计图、趋势图、报表图 | `chart` | 当前 target 是否支持 block 创建 |
| 操作面板、按钮面板 | `actionPanel` | 当前 target 是否支持 block 创建 |
| 自定义组件、自定义渲染块、代码区块 | `jsBlock` | 当前 target 是否支持 block 创建 |
| 刷新、重新加载 | `refresh` | 是否位于 block action scope |
| 批量删 | `bulkDelete` | 是否位于 block action scope |
| JS 代码、运行时代码 | JS 能力 | 当前 block/field/action 是否支持 JS |

## Default heuristic：先按上下文收敛，再决定是否追问

| 用户表达 | 默认先按什么收敛 | 什么时候必须停下来确认 | 可能落点 |
| --- | --- | --- | --- |
| 页面 | 有现成 locator/uid 时先按已有 `page` 处理；明确“新建页面”且带菜单语境时，默认走菜单优先链路 | 同时存在“新建页面”和“修改已有页面”两种解释 | `menu-item` / `page` |
| 页面入口、菜单、导航项 | 先判断是在说 `menu-group`、`menu-item`，还是已初始化 `page` | 可能是在说外链、移动端或工作台其它导航 | `menu-group` / `menu-item` / `page` |
| 新增、创建、新建 | 先绑定最近的名词对象；例如“新增 tab”先收敛到 tab，“新建筛选区”先收敛到 block | 只有动词没有对象，或对象可跨多个 family | 任一 surface family |
| 列表、列表页 | 先默认 `table` | 用户同时强调“轻量/移动端/卡片” | `table` / `list` / `gridCard` |
| 明细表、详情表 | 先看上下文是否在谈列、批量操作、分页；是则先按 `table` | 如果语义更像单记录只读详情 | `table` / `details` |
| 工作台、工作台页、工作台按钮区 | 先判断是否在说菜单分组或页面内部按钮区 | 工作台概念本身不明确，且 page 外层导航与页面内部 UI 都说得通 | 出 scope，或 `menu-group` / `actionPanel` |
| 工具栏、工具区 | 当前 target 是 collection block 时，先看 block actions；明确要独立按钮区时再看 `actionPanel` | block actions 与独立按钮区都说得通 | `actions` / `actionPanel` |
| 标签页、页签、tab | 已有 `tabSchemaUid` 或 page route 上下文时，先按 `outer-tab`；popup subtree 上下文时，先按 `popup-tab` | 只有自然语言 “tab”，没有任何 page/popup 上下文 | `outer-tab` / `popup-tab` |
| 页面头、header | 当前 target 是 tab 时先按 tab 元信息，否则先按 page 元信息 | page 和 tab 都可能被改名或改 icon | `page` / `outer-tab` / `popup-tab` |
| 页面布局、分栏、行列排布 | 现有容器已存在时先按 layout 改配；没有现成容器时先按 `compose` | 既可能是新搭结构，也可能是调整现有 grid | `compose` / layout |
| 打开详情、点击打开 | 字段语境先按 `openView`；记录按钮语境先按 `recordActions.view` | 字段和动作来源都不清楚 | `openView` / `recordActions.view` |
| 当前记录、本条记录、这一行 | 先按 record scope 收敛；popup 详情/编辑语境下默认走 record popup | 同时可能指“当前页面主记录”和“table 当前行” | `recordActions.*` / record popup（默认链见 recipe） |
| 抽屉打开、弹窗打开、自定义弹窗、弹出层 | 字段来源优先 `openView`；action 来源优先 popup action | 触发源不清楚 | field `openView` / popup action |
| 重置、清空 | 搜索 / 筛选 / 条件语境下先按 `filterForm.reset` | 可能是在说清空表单内容、清空布局或清空数据 | `reset` / 其他清空动作 |
| 代码按钮、自定义 JS 按钮 | 先按当前容器 scope 收敛 | 容器 scope 不清楚 | 对应 scope 下的 `js` action |
| 地图、评论 | 默认只读改已有能力 | 用户明确要创建新能力 | `map` / `comments` |

## 映射后的保守动作

- 映射只决定 capability 或对象语义，不决定具体 API、请求 envelope 或 readback。
- 菜单表达如果只给标题，必须先做菜单树发现；只有唯一命中的 `group` 才能继续写入。
- 只要会跨 family 或跨 action scope，就先收敛目标，不要直接生成写请求。
