# Aliases

把自然语言先归一化到这份词典，再映射具体能力。

## 页面与导航

- 页面、菜单页、工作台页、入口页 -> `createpage`
- 标签页、页签、tab -> `addtab/updatetab/movetab/removetab`
- 页面头、header -> page settings

## 区块

- 表格、数据表、列表表格、明细表 -> `table`
- 筛选区、过滤区、搜索表单、过滤表单 -> `filterForm`
- 列表、条目列表 -> `list`
- 卡片墙、卡片宫格、网格卡片 -> `gridCard`
- 详情区、详情块 -> `details`
- 新增表单、创建表单 -> `createForm`
- 编辑表单 -> `editForm`
- 说明区、帮助文案 -> `markdown`
- 嵌入网页、嵌入链接 -> `iframe`
- 工具栏、操作面板 -> `actionPanel`
- 自定义组件、自定义渲染块 -> `jsBlock`

## collection actions

- 新增、创建 -> `addNew`
- 刷新 -> `refresh`
- 批量删 -> `bulkDelete`
- 批量编辑 -> `bulkEdit`
- 批量更新 -> `bulkUpdate`
- 导出 -> `export`
- 导入 -> `import`
- 关联已有 -> `link`
- 上传 -> `upload`
- 触发流程 -> `triggerWorkflow`

## record actions

- 查看 -> `view`
- 编辑 -> `edit`
- 删除 -> `delete`
- 更新记录、就地更新 -> `updateRecord`
- 复制 -> `duplicate`
- 新增子级 -> `addChild`

## 配置

- 打开详情、点击打开 -> `clickToOpen + openView`
- 抽屉打开 -> `openView.mode = "drawer"`
- 弹窗打开 -> `openView.mode = "dialog"` 或 popup action
- 联动 -> `linkageRules`
- 事件流 -> `flowRegistry`
