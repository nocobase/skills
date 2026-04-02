# Popup And Event Flow

本文档是 popup、openView、linkageRules、event flow 场景的主参考文档。live MCP tool schema 与现场 `get/catalog/readback` 优先于本文；surface family 分流和 popup uid 词汇表看 [runtime-playbook.md](./runtime-playbook.md)，请求形状看 [tool-shapes.md](./tool-shapes.md)，写后验证看 [readback.md](./readback.md)。

## popup 相关能力出现在哪里

- action popup
- 关系字段 `openView`
- popup surface 内继续 `compose/add*`
- `popup-tab` lifecycle

popup 相关 uid 的含义、首选名称和兼容别名，统一看 `runtime-playbook` 顶部的 glossary。

record popup 的默认示例流程看 [record-popup-recipes.md](./record-popup-recipes.md)。

## 核心规则

- `recordActions.view/edit/popup` 默认只创建 popup shell，不会自动生成 `details`、`editForm` 或 `submit`。
- 拿到 `popupPageUid` / `popupTabUid` / `popupGridUid`，只代表 popup subtree 已建立，不代表 popup 内容已经完成。
- 用户要求“查看当前记录 / 编辑当前记录 / 本条记录 / 这一行”时，只有在 live `catalog.blocks[].resourceBindings` 明确暴露 `currentRecord` 时，才默认继续在 `popup-content` 下创建 `details(currentRecord)` 或 `editForm(currentRecord) + submit`。
- 如果 popup catalog 没有暴露 `currentRecord`，停止猜测，不要在普通 popup 上臆造记录绑定。
- `currentRecord` 是 popup 内 block 的资源绑定语义，不是“复用当前页面已有区块实例”。
- 不要把“当前记录”理解成把页面上已有 `table/details/editForm` 节点搬进 popup。

## 新建 popup 入口时的推荐顺序

1. 先创建会打开 popup 的 action 或 field
2. 如果写接口直接返回了 popup 相关 uid，优先复用这些 new target
3. 确认本次写的是 `popup-page`、`popup-tab`，还是 `popup-content`
4. 对对应 popup target 先 `catalog`
5. 再 `compose/configure/add*`
6. 如需更细配置，再看 `updateSettings`

如果当前已经明确拿到了 `popupPageUid` / `popupTabUid` / `popupGridUid`，可直接从目标判别和 `catalog` 开始，不必先创建触发 popup 的 action / field。

## record popup 的默认动作链

1. 创建 `recordActions.view/edit/popup`
2. 复用写接口直接返回的 `popupGridUid`
3. 对 `popup-content` 先 `catalog`
4. 只有当 live `catalog.blocks[].resourceBindings` 暴露 `currentRecord` 时，才继续创建 `details(currentRecord)` 或 `editForm(currentRecord) + submit`
5. 否则停止猜测，不要把普通 popup 当成 record popup 去写
6. 按 [readback.md](./readback.md) 做 popup 专项读回

## openView 与 popup 的区分

| 用户意图 | 优先能力 | 关注点 |
| --- | --- | --- |
| 字段点击打开详情 | `clickToOpen + openView` | 需要先读回关系字段 uid |
| 记录级查看/编辑按钮 | `recordActions.view/edit/popup` | 不要误写成字段 openView；创建 action 后还要继续搭 popup 内容，并确认是否可用 `currentRecord` |
| 动作按钮弹窗 | popup action | popup target 来自 action 写接口 |
| 抽屉打开 | `openView.mode = "drawer"` 或 popup drawer | 先判断触发源是字段还是 action |
| 普通弹窗打开 | `openView.mode = "dialog"` 或 popup action | 字段来源优先 openView，action 来源优先 popup |

常见字段 openView 改法：

- `clickToOpen`
- `openView.mode`
- `openView.collectionName`

## `linkageRules` 与 `flowRegistry`

- `linkageRules`：联动规则配置，属于具体 settings 域
- `flowRegistry`：节点实例级事件流配置域，默认标准入口是 `setEventFlows`

不要混淆：

- `linkageRules` 不是 `flowRegistry`
- `flowRegistry` 不是可以脱离 contract 猜 path 的普通 settings patch
- 先有可绑定的 settings / step，后有能引用它们的 event flow

## 推荐顺序：settings 先于 event flow

1. `get`
2. `catalog`
3. 写 popup/openView settings 或 `linkageRules`
4. `setEventFlows`
5. 按变更做必要读回

不要把 3 和 4 颠倒。

## 失败与修复优先级

- popup surface 与顶层 page/tab 不是同一作用域；不要混用 locator 与 lifecycle API
- 如果 popup settings 被清空，但 flow 仍引用旧 path，优先修正 settings 或 flow 引用，不要强行猜兼容路径
