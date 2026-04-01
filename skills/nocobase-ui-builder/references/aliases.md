# Aliases

本词典只负责把自然语言映射到 capability 或对象语义，不负责决定 lifecycle API、payload shape 或 readback。运行时分流看 [runtime-playbook.md](./runtime-playbook.md)，请求形状看 [tool-shapes.md](./tool-shapes.md)，横切停止条件以 [../SKILL.md](../SKILL.md) 的 `Global Rules` 为准。

使用前提：

- 只在 route-backed Modern page(v2) 范围内生效
- 超出该范围的导航、菜单、桌面路由、工作台概念，不要强行归一到本 skill

## 低歧义词：可直接映射

| 用户表达 | 默认映射 | 先检查什么 |
| --- | --- | --- |
| 表格、数据表、列表表格、明细表 | `table` | 当前 target 是否支持 block 创建 |
| 筛选区、过滤区、搜索表单、过滤表单 | `filterForm` | 是否存在可筛选目标 block |
| 卡片墙、卡片宫格、网格卡片、名片墙 | `gridCard` | 当前 target 是否支持 block 创建 |
| 详情区、详情块、只读详情 | `details` | 是否明确是只读详情 |
| 新增表单、创建表单、录入表单 | `createForm` | 是否明确是创建记录 |
| 编辑表单、修改表单 | `editForm` | 是否明确是编辑已有记录 |
| 通用表单、普通表单 | `form` | 是否明确要求兼容 `FormBlockModel` |
| 说明区、帮助文案、富文本说明 | `markdown` | 当前 target 是否支持 block 创建 |
| 嵌入网页、嵌入链接、内嵌 HTML | `iframe` | 当前 target 是否支持 block 创建 |
| 图表、统计图、趋势图、报表图 | `chart` | 当前 target 是否支持 block 创建 |
| 工具栏、操作面板、按钮面板 | `actionPanel` | 当前 target 是否支持 block 创建 |
| 自定义组件、自定义渲染块、代码区块 | `jsBlock` | 当前 target 是否支持 block 创建 |
| 刷新、重新加载 | `refresh` | 是否位于 block action scope |
| 批量删 | `bulkDelete` | 是否位于 block action scope |
| 重置、清空 | `reset` | 是否处于 `filterForm` |
| JS 代码、运行时代码 | JS 能力 | 当前 block/field/action 是否支持 JS |

## 高歧义词：必须先收敛

| 用户表达 | 必须先澄清什么 | 可能落点 |
| --- | --- | --- |
| 页面、页面入口 | 是新建页面还是修改已有页面 | `page` |
| 新增、创建、新建 | 新增的是页面、tab、表单、记录，还是别的节点 | 任一 surface family |
| 列表、列表页 | 用户要的是 `table`、`list` 还是 `gridCard` | `table` / `list` / `gridCard` |
| 工作台、工作台页、工作台按钮区 | 用户说的是 page 外层导航，还是 page 内部按钮区 | 出 scope，或 `actionPanel` |
| 标签页、页签、tab | 目标是 `outer tab` 还是 `popup child tab` | `outer tab` / `popup child tab` |
| 页面头、header | 是 page 元信息还是 tab 元信息 | `page` / `outer tab` / `popup child tab` |
| 页面布局、分栏、行列排布 | 是新搭建，还是已有容器重排 | `compose` 结构搭建 / layout 改配 |
| 打开详情、点击打开 | 来源是字段点击还是记录动作 | `openView` / `recordActions.view` |
| 抽屉打开、弹窗打开、自定义弹窗、弹出层 | 来源是字段还是 action | field `openView` / popup action |
| 代码按钮、自定义 JS 按钮 | scope 是 `block`、`record`、`form`、`filterForm` 还是 `actionPanel` | 对应 scope 下的 `js` action |
| 地图、评论 | 是读改已有能力，还是创建新能力 | `map` / `comments` |

## 映射后的保守动作

- 映射只决定 capability 或对象语义，不决定具体 API、请求 envelope 或 readback。
- 如果对象和动词都不清楚，先收敛目标，不要直接生成写请求。
