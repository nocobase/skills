# Aliases

本词典只负责把自然语言映射到 capability 或对象语义，不负责决定 lifecycle API、payload shape 或 readback。运行时分流看 [runtime-playbook.md](./runtime-playbook.md)，请求形状看 [tool-shapes.md](./tool-shapes.md)。

使用前提：

- 只在 Modern page(v2) surface 范围内生效；route-backed family 与 popup family 都在本 skill 覆盖范围内
- 超出该范围的导航、菜单、桌面路由、工作台概念，不要强行归一到本 skill

## Default heuristic：可直接映射

| 用户表达 | 默认映射 | 先检查什么 |
| --- | --- | --- |
| 表格、数据表、列表表格 | `table` | 当前 target 是否支持 block 创建 |
| 筛选区、过滤区、搜索表单、过滤表单 | `filterForm` | 是否存在可筛选目标 block |
| 卡片墙、卡片宫格、网格卡片、名片墙 | `gridCard` | 当前 target 是否支持 block 创建 |
| 详情区、详情块、只读详情 | `details` | 是否明确是只读详情 |
| 新增表单、创建表单、录入表单 | `createForm` | 是否明确是创建记录 |
| 编辑表单、修改表单 | `editForm` | 是否明确是编辑已有记录 |
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
| 页面、页面入口 | 有现成 locator/uid 时先按已有 `page` 处理；只有明确“新建页面入口”时才走创建 | 同时存在“新建页面”和“修改已有页面”两种解释 | `page` |
| 新增、创建、新建 | 先绑定最近的名词对象；例如“新增 tab”先收敛到 tab，“新建筛选区”先收敛到 block | 只有动词没有对象，或对象可跨多个 family | 任一 surface family |
| 列表、列表页 | 先默认 `table` | 用户同时强调“轻量/移动端/卡片” | `table` / `list` / `gridCard` |
| 明细表、详情表 | 先看上下文是否在谈列、批量操作、分页；是则先按 `table` | 如果语义更像单记录只读详情 | `table` / `details` |
| 工作台、工作台页、工作台按钮区 | 先判断是否在说 page 外层导航；若是则直接出 scope | 用户其实在说 page 内部按钮区 | 出 scope，或 `actionPanel` |
| 工具栏、工具区 | 当前 target 是 collection block 时，先看 block actions；明确要独立按钮区时再看 `actionPanel` | block actions 与独立按钮区都说得通 | `actions` / `actionPanel` |
| 标签页、页签、tab | 已有 `tabSchemaUid` 或 page route 上下文时，先按 `outer-tab`；popup subtree 上下文时，先按 `popup-tab` | 只有自然语言 “tab”，没有任何 page/popup 上下文 | `outer-tab` / `popup-tab` |
| 页面头、header | 当前 target 是 tab 时先按 tab 元信息，否则先按 page 元信息 | page 和 tab 都可能被改名或改 icon | `page` / `outer-tab` / `popup-tab` |
| 页面布局、分栏、行列排布 | 现有容器已存在时先按 layout 改配；没有现成容器时先按 `compose` | 既可能是新搭结构，也可能是调整现有 grid | `compose` / layout |
| 打开详情、点击打开 | 字段语境先按 `openView`；记录按钮语境先按 `recordActions.view` | 字段和动作来源都不清楚 | `openView` / `recordActions.view` |
| 抽屉打开、弹窗打开、自定义弹窗、弹出层 | 字段来源优先 `openView`；action 来源优先 popup action | 触发源不清楚 | field `openView` / popup action |
| 重置、清空 | 搜索 / 筛选 / 条件语境下先按 `filterForm.reset` | 可能是在说清空表单内容、清空布局或清空数据 | `reset` / 其他清空动作 |
| 代码按钮、自定义 JS 按钮 | 先按当前容器 scope 收敛 | 容器 scope 不清楚 | 对应 scope 下的 `js` action |
| 地图、评论 | 默认只读改已有能力 | 用户明确要创建新能力 | `map` / `comments` |

## 映射后的保守动作

- 映射只决定 capability 或对象语义，不决定具体 API、请求 envelope 或 readback。
- 只要会跨 family 或跨 action scope，就先收敛目标，不要直接生成写请求。
