# Record Popup Recipes

本文件只给 record popup 的默认 recipe，不负责 lifecycle API 选择、payload envelope 或通用读回流程；这些分别看 [runtime-playbook.md](./runtime-playbook.md)、[tool-shapes.md](./tool-shapes.md)、[readback.md](./readback.md)。

## Hard rule

- `recordActions.view/edit/popup` 默认只创建 popup shell，不会自动生成 popup 内容。
- `currentRecord` 是 popup 内 block 的资源绑定语义，不是复用当前页面上已有 `table/details/editForm` 区块实例。
- 用户明确说“查看当前记录 / 编辑当前记录 / 本条记录 / 这一行”时，默认要把 popup 内容绑定到 `currentRecord`。

## Recipe：table + row view + details(currentRecord)

适用：

- 表格每行有“查看”
- 用户说“查看当前记录 / 查看本条 / 查看这一行”
- 目标是只读详情弹窗

默认流程：

1. 在 `table` 上创建 `recordActions.view`
2. 复用写接口返回的 `popupGridUid`
3. 对 `popup-content` 先 `catalog`
4. 在 `popupGridUid` 下继续创建 `details`
5. `details` 的 resource 默认绑定 `currentRecord`
6. 按需补字段与标题
7. 读回确认 popup 不为空，且 `details` 已落到 `currentRecord`

不要误做：

- 不要只创建 `view` action 就结束
- 不要把页面上已有 `DetailsBlockModel` 当成“当前记录详情区块”直接复用
- 不要把 `currentRecord` 写成 collection 级 binding

## Recipe：table + row edit + editForm(currentRecord) + submit

适用：

- 表格每行有“编辑”
- 用户说“编辑当前记录 / 编辑本条 / 编辑这一行”
- 目标是当前记录编辑弹窗

默认流程：

1. 在 `table` 上创建 `recordActions.edit`
2. 复用写接口返回的 `popupGridUid`
3. 对 `popup-content` 先 `catalog`
4. 在 `popupGridUid` 下继续创建 `editForm`
5. `editForm` 的 resource 默认绑定 `currentRecord`
6. 在表单 actions 内补 `submit`
7. 读回确认 popup 不为空，且 `editForm + submit` 已落盘

不要误做：

- 不要把“编辑当前记录”只理解成创建 `edit` action
- 不要把页面上已有 `EditFormModel` 实例直接搬进 popup
- 不要漏掉 `submit`

## Record Popup 与 Plain Popup 的区别

| 场景 | 默认 popup 内容 | 默认资源语义 | 常见触发源 |
| --- | --- | --- | --- |
| `recordActions.view` | `details` | `currentRecord` | table/list/gridCard/details 的记录级按钮 |
| `recordActions.edit` | `editForm + submit` | `currentRecord` | table/list/gridCard/details 的记录级按钮 |
| `recordActions.popup` | 取决于用户说明；未说明时只会得到空 shell | 先看用户需求 | table/list/gridCard/details 的记录级按钮 |
| block action popup | 常见是 `createForm` 或自定义内容 | 通常不是 `currentRecord` | table/list/gridCard 的 block action |
| 字段 `openView` | 详情或关系记录视图 | 跟字段/关系语义走，不等于 record action popup | 关系字段点击打开 |
