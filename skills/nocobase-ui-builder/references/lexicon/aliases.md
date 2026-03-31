# Aliases

把自然语言先归一化到这份词典，再映射具体能力。

## 页面与导航

- 页面、菜单页、工作台页、入口页 -> `createpage`
- 标签页、页签、tab -> `addtab/updatetab/movetab/removetab`
- 页面头、header -> page settings
- 页面布局、分栏、行列排布 -> `compose.layout` 或 `setlayout`

## 区块

- 表格、数据表、列表表格、明细表 -> `table`
- 筛选区、过滤区、搜索表单、过滤表单 -> `filterForm`
- 列表、条目列表、轻列表、移动端列表 -> `list`
- 卡片墙、卡片宫格、网格卡片、名片墙 -> `gridCard`
- 详情区、详情块、只读详情 -> `details`
- 新增表单、创建表单、录入表单 -> `createForm`
- 编辑表单、修改表单 -> `editForm`
- 通用表单、普通表单 -> `form`
- 说明区、帮助文案、富文本说明 -> `markdown`
- 嵌入网页、嵌入链接、内嵌 HTML -> `iframe`
- 图表、统计图、趋势图、报表图 -> `chart`
- 工具栏、操作面板、按钮面板、工作台按钮区 -> `actionPanel`
- 自定义组件、自定义渲染块、代码区块 -> `jsBlock`
- 地图、地图区块 -> `map`
- 评论、留言区、评论区 -> `comments`

## collection actions

- 筛选、过滤、搜索按钮 -> `filter`
- 新增、创建、新建 -> `addNew`
- 刷新、重新加载 -> `refresh`
- 自定义弹窗、弹出层 -> `popup`
- 展开折叠、树表展开 -> `expandCollapse`
- 批量删 -> `bulkDelete`
- 批量编辑 -> `bulkEdit`
- 批量更新 -> `bulkUpdate`
- 导出 -> `export`
- 导出附件 -> `exportAttachments`
- 导入 -> `import`
- 关联已有、选择已有 -> `link`
- 上传 -> `upload`
- 发邮件、邮件发送 -> `composeEmail`
- 打印、模板打印 -> `templatePrint`
- 触发流程、执行工作流 -> `triggerWorkflow`
- 自定义 JS 按钮、代码按钮 -> `js`

## record actions

- 查看、打开详情 -> `view`
- 编辑、修改 -> `edit`
- 删除 -> `delete`
- 更新记录、就地更新 -> `updateRecord`
- 复制 -> `duplicate`
- 新增子级、添加子项 -> `addChild`
- 行内弹窗、卡片弹窗 -> `popup`

## form / filter-form actions

- 提交、保存、查询 -> `submit`
- 重置、清空 -> `reset`
- 折叠、展开筛选区 -> `collapse`

## 配置

- 打开详情、点击打开 -> `clickToOpen + openView`
- 抽屉打开 -> `openView.mode = "drawer"`
- 弹窗打开 -> `openView.mode = "dialog"` 或 popup action
- 联动 -> `linkageRules`
- 事件流 -> `flowRegistry`
- 数据范围、筛选条件 -> `dataScope`
- 排序 -> `sorting`
- 每页条数 -> `pageSize`
- 卡片列数 -> `columns`
- 行数 -> `rowCount`
- JS 代码、运行时代码 -> `code + version`
