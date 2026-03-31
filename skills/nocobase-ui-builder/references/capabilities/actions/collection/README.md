# Collection Actions

collection action 指 block 顶部或 block 级作用域的动作，不是单条记录动作。

## 高频 action

- `filter`
- `addNew`
- `popup`
- `refresh`
- `expandCollapse`
- `bulkDelete`
- `bulkEdit`
- `bulkUpdate`
- `export`
- `exportAttachments`
- `import`
- `link`
- `upload`
- `composeEmail`
- `templatePrint`
- `triggerWorkflow`
- `js`

## 作用速查

| action | 作用 |
| --- | --- |
| `filter` | 触发集合筛选或联动筛选 |
| `addNew` | 新增记录，常配 createForm popup |
| `popup` | 自定义集合级 popup 内容 |
| `refresh` | 重新加载 block 数据 |
| `expandCollapse` | 树表展开/折叠 |
| `bulkDelete` | 批量删除选中记录 |
| `bulkEdit` | 批量编辑多个记录 |
| `bulkUpdate` | 批量更新指定字段值 |
| `export` | 导出当前数据集 |
| `exportAttachments` | 导出附件 |
| `import` | 导入数据 |
| `link` | 关联已有记录 |
| `upload` | 上传并与记录建立关联 |
| `composeEmail` | 发邮件 |
| `templatePrint` | 模板打印 |
| `triggerWorkflow` | 触发工作流 |
| `js` | 自定义 JS 动作 |

## 容器分布

- table 支持最全
- list/gridCard 支持其中的 collection block 子集
- actionPanel 主要支持 `js` 和 `triggerWorkflow`

## 选择原则

- 对整块数据集生效的动作，归到 collection action。
- 对单条记录生效的动作，归到 `recordActions`。
- `addNew` 常常配 popup surface。
- `bulk*` 系列仅 table。
