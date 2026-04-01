# Aliases

本词典先做意图判别，再映射具体 capability。只有低歧义词才能直接映射；高歧义词必须结合现场 `get/catalog` 和用户动词收敛。

使用前提：

- 只在 route-backed Modern page(v2) 范围内生效。
- 超出该范围的导航、菜单、桌面路由、工作台概念，不要强行归一到本 skill。

## 低歧义 block / action / config 词

| 用户表达 | 候选 capability | 先检查什么 | 默认映射 / 停止条件 |
| --- | --- | --- | --- |
| 表格、数据表、列表表格、明细表 | `table` | 当前 target 是否支持 block 创建 | 默认映射到 `table` |
| 筛选区、过滤区、搜索表单、过滤表单 | `filterForm` | 是否存在可筛选目标 block | 默认映射到 `filterForm`；多目标时必须显式 target |
| 列表、条目列表、轻列表、移动端列表 | `list` | 当前 target 是否支持 block 创建 | 默认映射到 `list` |
| 卡片墙、卡片宫格、网格卡片、名片墙 | `gridCard` | 当前 target 是否支持 block 创建 | 默认映射到 `gridCard` |
| 详情区、详情块、只读详情 | `details` | 是否明确是只读详情而非编辑表单 | 默认映射到 `details` |
| 新增表单、创建表单、录入表单 | `createForm` | 是否明确是创建记录 | 默认映射到 `createForm` |
| 编辑表单、修改表单 | `editForm` | 是否明确是编辑已有记录 | 默认映射到 `editForm` |
| 通用表单、普通表单 | `form` | 是否明确要求兼容 `FormBlockModel` | 只有明确要求通用表单时才映射到 `form` |
| 说明区、帮助文案、富文本说明 | `markdown` | 当前 target 是否支持 block 创建 | 默认映射到 `markdown` |
| 嵌入网页、嵌入链接、内嵌 HTML | `iframe` | 当前 target 是否支持 block 创建 | 默认映射到 `iframe` |
| 图表、统计图、趋势图、报表图 | `chart` | 当前 target 是否支持 block 创建 | 默认映射到 `chart` |
| 工具栏、操作面板、按钮面板、工作台按钮区 | `actionPanel` | 当前 target 是否支持 block 创建 | 默认映射到 `actionPanel` |
| 自定义组件、自定义渲染块、代码区块 | `jsBlock` | 当前 target 是否支持 block 创建 | 默认映射到 `jsBlock` |
| 筛选、过滤、搜索按钮 | `filter` | 动作 scope 是否是 block action | 默认映射到 collection action `filter` |
| 刷新、重新加载 | `refresh` | 动作 scope 是否是 block action | 默认映射到 collection action `refresh` |
| 批量删 | `bulkDelete` | 动作 scope 是否是 block action | 默认映射到 collection action `bulkDelete` |
| 查看、编辑、删除、复制、新增子级 | `view` / `edit` / `delete` / `duplicate` / `addChild` | 容器是否支持 `recordActions` | 默认映射到 `recordActions`，不能放进 `addAction` |
| 重置、清空 | `reset` | 是否处于 `filterForm` | 默认映射到 filter-form action `reset` |
| 联动 | `linkageRules` | `settingsContract` 是否暴露该域 | 默认映射到配置域 `linkageRules` |
| 事件流 | `flowRegistry` | 相关 action/field/path 是否已存在 | 默认映射到配置域 `flowRegistry` |
| 数据范围、筛选条件 | `dataScope` | 输入是否为 FilterGroup | 非 FilterGroup 先收敛结构，再写入 |
| 排序 | `sorting` | 容器或字段是否支持该配置 | 默认映射到 `sorting` |
| 每页条数 | `pageSize` | 容器是否支持该配置 | 默认映射到 `pageSize` |
| 卡片列数 | `columns` | 是否是 `gridCard` 或等价响应式列数配置 | 默认映射到 `columns` |
| 行数 | `rowCount` | 容器是否支持该配置 | 默认映射到 `rowCount` |
| JS 代码、运行时代码 | `code + version` | 当前 block / field / action 是否支持 JS 能力 | 默认映射到 `code + version` |

## 高歧义词，必须先判别

| 用户表达 | 候选 capability | 先检查什么 | 默认映射 / 停止条件 |
| --- | --- | --- | --- |
| 页面、页面入口 | `createPage` / 读取已有 page 再修改 | 是否明确是“新建页面入口” | 只有明确“创建/新建页面”时才走 `createPage`；否则先 `get` 现状 |
| 新增、创建、新建 | `createPage` / `createForm` / `addTab` / `addNew` | 用户要新增的是页面、tab、表单、记录，还是别的节点 | 先按对象和动词收敛；对象不清楚时停止直接映射 |
| 菜单页、工作台页、入口页 | route-backed page / 非本 skill 范围 | 是否真的是 route-backed Modern page(v2) | 不是 route-backed page 就停止，不强行归一 |
| 标签页、页签、tab | `addTab` / `updateTab` / `moveTab` / `removeTab` / `addPopupTab` / `updatePopupTab` / `movePopupTab` / `removePopupTab` | 动词是新增、改名、排序还是删除；目标是外层 page 还是 popup page | 先判断 tab 所在层级；外层 tab 当前统一以 `tabSchemaUid` 作为 canonical uid；只有名词没有动作时先停 |
| 弹窗标签页、弹窗页签、popup tab | `addPopupTab` / `updatePopupTab` / `movePopupTab` / `removePopupTab` | 当前目标是否属于 popup page / popup child tab | 默认映射到 popup child tab 生命周期，不要混用外层 tab API |
| 页面头、header | page root config / tab config | 是 page 元信息还是 tab 元信息 | 先定位目标节点，再决定 `configure` 或 `updateTab` |
| 页面布局、分栏、行列排布 | `compose.layout` / `setLayout` | 是新搭建还是已有容器全量重排 | 新搭建优先 `compose.layout`；全量重排才用 `setLayout` |
| 打开详情、点击打开 | `clickToOpen + openView` / `recordActions.view` | 触发点是字段点击还是记录动作 | 字段点击优先 `clickToOpen + openView`；记录级入口优先 `recordActions.view` |
| 抽屉打开 | `openView.mode = "drawer"` / popup drawer | 来源是字段还是 action | 先判断触发源，再决定写到 field settings 还是 action popup |
| 弹窗打开、自定义弹窗、弹出层 | popup action / `openView.mode = "dialog"` | 来源是 action 还是字段 | action 来源优先 popup；字段来源优先 `openView.mode = "dialog"` |
| 代码按钮、自定义 JS 按钮 | `js` action | 容器 scope 是 block、record、form 还是 action-panel | 先看 scope，再加对应类型的 JS action |
| 地图、评论 | `map` / `comments` | 用户是否明确要求创建，以及现场 `catalog` 是否暴露创建能力 | 默认不创建；只有用户明确要求且现场 contract 允许时才继续 |
