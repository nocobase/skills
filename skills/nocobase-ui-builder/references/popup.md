# Popup

本文档是 popup / `openView` / `currentRecord` guard / `linkageRules` / `flowRegistry` / record popup recipes 的唯一 owner。只要问题里出现 popup、抽屉/弹窗打开、当前记录、联动规则或事件流，默认先看这里。family / uid 词汇表看 [runtime-playbook.md](./runtime-playbook.md)，请求形状看 [tool-shapes.md](./tool-shapes.md)，读回规则看 [verification.md](./verification.md)。

## Core Rules

- `recordActions.view/edit/popup` 默认只创建 popup shell，不会自动生成 `details`、`editForm` 或 `submit`。
- 拿到 `popupPageUid` / `popupTabUid` / `popupGridUid` 只代表 popup subtree 已建立，不代表 popup 内容已经完成。
- 用户要求“查看当前记录 / 编辑当前记录 / 本条记录 / 这一行”时，只有在 live `catalog.blocks[].resourceBindings` 明确暴露 `currentRecord` 时，才默认继续在 `popup-content` 下创建 `details(currentRecord)` 或 `editForm(currentRecord) + submit`。
- 如果 popup catalog 没有暴露 `currentRecord`，停止猜测，不要在普通 popup 上臆造记录绑定。
- `currentRecord` 属于 popup 内 block 的资源绑定语义，不是复用页面上已有区块实例。

## 默认 popup 写流程

1. 先创建会打开 popup 的 action 或 field；如果当前已经拿到 popup 相关 uid，可直接从第 3 步开始。
2. 如果写接口直接返回了 popup 相关 uid，优先复用这些 new target。
3. 明确本次写的是 `popup-page`、`popup-tab` 还是 `popup-content`。
4. 对对应 popup target 先 `catalog`。
5. 再 `compose/configure/add*`；只有需要更细 path-level 配置时再看 `updateSettings`。
6. 写后按 [verification.md](./verification.md) 做 popup 专项 `readback`。

## Record Popup Recipes

### 查看当前记录：`recordActions.view -> details(currentRecord)`

1. 在 `table/details/list/gridCard` 上创建 `recordActions.view`。
2. 复用写接口返回的 `popupGridUid`。
3. 对 `popup-content` 先 `catalog`。
4. 只有 guard 通过时，才创建 `details(currentRecord)`。
5. 写后确认 popup 内容里实际出现 `details`，而不是只剩空 shell。

### 编辑当前记录：`recordActions.edit -> editForm(currentRecord) + submit`

1. 在 `table/details/list/gridCard` 上创建 `recordActions.edit`。
2. 复用写接口返回的 `popupGridUid`。
3. 对 `popup-content` 先 `catalog`。
4. 只有 guard 通过时，才创建 `editForm(currentRecord)` 并补 `submit`。
5. 写后确认 popup 内容里实际出现 `editForm` 与 `submit`。

## `openView` vs popup action

| 用户意图 | 优先能力 | 关注点 |
| --- | --- | --- |
| 字段点击打开详情 | `clickToOpen + openView` | 先读回关系字段 uid |
| 记录级查看/编辑按钮 | `recordActions.view/edit/popup` | 创建 action 后还要继续搭 popup 内容，并确认是否可用 `currentRecord` |
| 动作按钮弹窗 | popup action | popup target 来自 action 写接口 |
| 抽屉打开 | `openView.mode = "drawer"` 或 popup drawer | 先判断触发源是字段还是 action |
| 普通弹窗打开 | `openView.mode = "dialog"` 或 popup action | 字段来源优先 openView，action 来源优先 popup |

常见字段 `openView` 改法：`clickToOpen`、`openView.mode`、`openView.collectionName`。

## `linkageRules` 与 `flowRegistry`

- `linkageRules` 属于具体 settings 域；`flowRegistry` 属于节点实例级事件流配置域，标准入口是 `setEventFlows`。
- 不要混淆：`linkageRules` 不是 `flowRegistry`，`flowRegistry` 也不是可以脱离 contract 猜 path 的普通 settings patch。
- 推荐顺序：`get -> catalog -> 写 popup/openView settings 或 linkageRules -> setEventFlows -> readback`。
- 如果 popup settings 被清空，但 flow 仍引用旧 path，优先修正 settings 或 flow 引用，不要强行猜兼容路径。
