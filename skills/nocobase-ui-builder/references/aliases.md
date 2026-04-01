# Aliases

本词典先做意图判别，再映射具体 capability。只有低歧义词才能直接映射；高歧义词必须结合现场 `get/catalog` 和用户动词收敛。

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
| 工具栏、操作面板、按钮面板、工作台按钮区 | `actionPanel` | 当前 target 是否支持 block 创建 |
| 自定义组件、自定义渲染块、代码区块 | `jsBlock` | 当前 target 是否支持 block 创建 |
| 刷新、重新加载 | `refresh` | 是否位于 block action scope |
| 批量删 | `bulkDelete` | 是否位于 block action scope |
| 重置、清空 | `reset` | 是否处于 `filterForm` |
| 联动 | `linkageRules` | `settingsContract` 是否暴露该域 |
| 事件流 | `flowRegistry` | 相关 action/field/path 是否已存在 |
| 数据范围、筛选条件 | `dataScope` | 输入是否为 FilterGroup |
| 排序 | `sorting` | 容器或字段是否支持该配置 |
| 每页条数 | `pageSize` | 容器是否支持该配置 |
| 卡片列数 | `columns` | 是否是 `gridCard` |
| 行数 | `rowCount` | 是否是响应式卡片场景 |
| JS 代码、运行时代码 | `code + version` | 当前 block/field/action 是否支持 JS |

## 高歧义词：必须先收敛

| 用户表达 | 先收敛什么 | 默认动作 |
| --- | --- | --- |
| 页面、页面入口 | 是新建页面还是修改已有页面 | 只有明确“创建/新建页面”时才走 `createPage`；否则先 `get` 现状 |
| 新增、创建、新建 | 新增的是页面、tab、表单、记录，还是别的节点 | 对象不清楚时停止直接映射 |
| 列表、列表页 | 用户要的是 `table`、`list` 还是 `gridCard` | 默认不要直接映射；只有明确“轻列表 / 条目列表 / 移动端列表”时才优先 `list` |
| 菜单页、工作台页、入口页 | 是否真的是 route-backed Modern page(v2) | 不是本 skill 范围就停止 |
| 标签页、页签、tab | 动词是新增、改名、排序还是删除；目标是 outer tab 还是 popup child tab | 先判断 tab 所在层级 |
| 弹窗标签页、popup tab | 当前目标是否属于 popup page | 默认映射 popup child tab lifecycle；不要混用 outer tab API |
| 页面头、header | 是 page 元信息还是 tab 元信息 | 先定位目标节点，再决定 `configure` 或 tab lifecycle 接口 |
| 页面布局、分栏、行列排布 | 是新搭建还是已有容器全量重排 | 新搭建优先 `compose.layout`；全量重排才用 `setLayout` |
| 打开详情、点击打开 | 触发点是字段点击还是记录动作 | 字段点击优先 `clickToOpen + openView`；记录级入口优先 `recordActions.view` |
| 抽屉打开 | 来源是字段还是 action | 字段来源优先 `openView.mode = "drawer"`；action 来源优先 popup |
| 弹窗打开、自定义弹窗、弹出层 | 来源是 action 还是字段 | action 来源优先 popup；字段来源优先 `openView.mode = "dialog"` |
| 代码按钮、自定义 JS 按钮 | 容器 scope 是 `block`、`record`、`form` 还是 `actionPanel` | 先选对 scope，再加对应 `js` action |
| 地图、评论 | 用户是否明确要求创建，且现场 `catalog` 是否暴露创建能力 | 默认不创建；只有明确要求且现场允许时才继续 |

## 映射后的保守动作

- 如果 block / field / action / 配置域没有被现场 `catalog` 明确暴露，停止猜测并说明边界
- 如果对象和动词都不清楚，先收敛目标，不要直接生成写请求
