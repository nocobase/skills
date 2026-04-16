# NocoBase DSL Reconciler — 踩坑记录

新上下文必读。这些都是实际调试过的 API 行为，不是猜测。

## API 陷阱

### desktopRoutes:update 必须用 POST，不是 PUT
```
✗ PUT /api/desktopRoutes:update?filterByTk=ID  → 返回 200 但不生效
✓ POST /api/desktopRoutes:update?filterByTk=ID → 真正更新
```
NocoBase resource actions 全部用 POST。PUT 静默失败。

### flowModels:update 会清除 parentId → 节点消失
**永远不要直接调 flowModels:update**。用 `flowSurfaces:configure` 或 `client.updateModel()`（内部 GET → merge → save）。

### enableTabs 存在 route 上，不在 flowModel 上
```
✗ nb.updateModel(pageUid, { pageSettings: { general: { enableTabs: true } } })  → 不生效
✓ POST /api/desktopRoutes:update?filterByTk=routeId → { enableTabs: true }
```
flowModel 的 stepParams.pageSettings.general.enableTabs 是**只读镜像**，写入无效。

### Tab 标题也在 route 上
flowModel 的 `pageTabSettings.title.title` 和 route 的 `title` 都要更新。只改一个，前端可能用另一个。

### compose API 的 target 必须是正确层级
- 页面 block: `compose(tabSchemaUid, blocks)` ✓
- 弹窗 block: `compose(popupTabUid, blocks)` ✓ — 用 ChildPage 的 tab UID
- ✗ `compose(fieldUid, blocks)` — 对弹窗的 field UID 可以创建 ChildPage
- ✗ `compose(actionUid, blocks)` — 对 action UID 也可以
- ✗ `compose(pageSchemaUid, blocks)` — 报 400

### details block 的 edit action 必须在 recordActions
```
✗ compose({ type: 'details', actions: [{ type: 'edit' }] })  → 400 错误
✓ compose({ type: 'details', recordActions: [{ type: 'edit' }] })  → OK
```
compose API 对 DetailsBlockModel 有限制：edit/view 必须放 recordActions 不是 actions。

### resource.dataSourceKey 必须存在
compose block 如果有 `resource.collectionName` 但没有 `dataSourceKey`，报 400。
总是加 `dataSourceKey: 'main'`。

### 弹窗内 block 的 resource binding
```
✗ resource: { collectionName: 'xxx', dataSourceKey: 'main' }  → editForm 在弹窗里报错
✓ resource: { collectionName: 'xxx', dataSourceKey: 'main', binding: 'currentRecord' }
```
弹窗上下文的 editForm/details 需要 `binding: 'currentRecord'`。

### filterForm 不需要 submit/reset actions
NocoBase filterForm 默认就是输入即搜索。加 submit/reset 按钮没意义。

### filterManager 存在 PAGE-LEVEL BlockGridModel 上
```
✗ filterForm block → filterFormGrid → filterManager  → 不生效
✓ pageTab → BlockGridModel → filterManager  → 生效
```
filterManager 是 filterForm 和 table 的连接配置，必须放在页面级 grid 上。

### popupSettings.uid 指向 field 自己（不是 ChildPage）
```
原始系统: popupSettings.openView.uid = templateField.uid (模板里的 field)
部署时: popupSettings.openView.uid = fieldUid (自己)
```
NocoBase 解析: uid → 找 field → 读 field.subModels.page → 渲染 ChildPage 内容。

### popupTemplateUid 不跨系统
`popupTemplateUid` 指向的模板在原始系统存在，跨系统部署时不存在。
用复制模式（compose 模板内容到 ChildPage）替代引用模式。

## 布局陷阱

### gridSettings.rows 的列和行
```
rows: { rowId: [["uid1", "uid2"]] }  → 1 列，uid1 和 uid2 垂直堆叠
rows: { rowId: [["uid1"], ["uid2"]] }  → 2 列，uid1 和 uid2 水平并排
```
外层数组 = 列，内层数组 = 列内堆叠的 blocks。

### setLayout 后必须 moveNode 同步 items 顺序
`gridSettings.rows` 定义布局，但 `subModels.items` 数组顺序影响渲染。
setLayout 后用 moveNode 让 items 顺序和 rows 一致。

### form 内 JS items 必须在 field items 前面
NocoBase 按 items 数组顺序渲染。filter-stats 按钮组（JSItemModel）要在搜索框（FilterFormItemModel）前面。
用 `syncGridItemsOrder` 在 fillBlock 末尾统一排序。

### sortIndex 决定 form grid items 顺序
filterForm 内没有 gridSettings.rows，靠 sortIndex 排序。

## 导出陷阱

### field click popup 在 col.subModels.field.subModels.page
```
✗ col.subModels.page  → 不是这里
✓ col.subModels.field.subModels.page  → 在 field model 下面
```
Table column 的 popup 不在 column 上，在 column 的 field 子模型上。

### reference block 需要解引用
ReferenceBlockModel 只有 `referenceSettings.useTemplate.targetUid`。
导出时用 `nb.get({ uid: targetUid })` 读取实际 form/table 内容。
部署时创建实际 block，不用 reference。

### collection 的 field 名用 camelCase
```
✗ created_at → NocoBase SQL 报错 "Invalid SQL column or table reference"
✓ "createdAt" → OK（需要双引号）
```
NocoBase flowSql 验证 column 名必须是 camelCase。

### routes API tree 模式 vs flat 模式
```
paginate: false → 只返回 20 条（不是全部！）
pageSize: 500 → 返回全部
tree: true → 返回嵌套 children（但 paginate:false 会截断）
```
用 `pageSize: 500` 不用 `paginate: false`。

## 部署顺序

1. Collections（数据表 + 字段）
2. Templates（模板先创建，后面引用）
3. Routes（group + pages）
4. Page blocks（compose + fillBlock）
5. Popups（popup-deployer，用 popup file 或 inline popup 内容）
6. clickToOpen（设 popupSettings，不自己 compose — popup 已部署）
7. Post-verify + SQL verify
8. Auto-sync（重新导出保持本地同步）
9. Graph rebuild + _refs.yaml

## 弹窗部署优先级

1. **Inline popup**（field spec 里 `popup:` 有 blocks/tabs）→ deploySurface/deployPopup
2. **Popup file**（`popups/*.yaml`）→ popup-deployer（检查 blockCount 匹配）
3. **Template copy**（loadTemplateContent）→ deploySurface
4. **Default fallback** → compose 默认 details with collection fields
