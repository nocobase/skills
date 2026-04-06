# Popup

当你要处理 popup、`openView`、record popup、`currentRecord` guard，或 popup 内的关联资源绑定时，读本文。popup family 与 uid 来源看 [runtime-playbook.md](./runtime-playbook.md)，请求形状看 [tool-shapes.md](./tool-shapes.md)，写后核对看 [verification.md](./verification.md)。是否允许 `shell-only popup`、以及何时必须先读 `catalog`，统一看 [normative-contract.md](./normative-contract.md)。

## Core Rules

- `recordActions.view/edit/popup` 默认只创建 popup shell，不会自动生成 `details`、`editForm` 或 `submit`。
- popup-capable payload 的 canonical shape 与 `popup.mode` 规则统一看 [tool-shapes.md](./tool-shapes.md)；inline 新 popup subtree 默认优先 `replace`。
- 命中 `currentRecord`、`associatedRecords`、或 popup `resourceBindings` 判定时，统一走 `guard-first popup flow`：先创建 opener，复用返回的 popup uid，再读 `popup-content` 的 `catalog`。
- 拿到 `popupPageUid` / `popupTabUid` / `popupGridUid` 只代表 popup subtree 已建立，不代表 popup 内容已经完成。
- 只要写接口已经返回 `popupPageUid` / `popupTabUid` / `popupGridUid`，下一步一律直接复用这些 uid，不重新猜 hostUid / gridUid。
- 是否允许把本次结果停在 `shell-only popup`，统一按 [normative-contract.md](./normative-contract.md) 的 `Popup Shell Fallback Contract` 判断；不要在本页重复定义跨专题门槛。
- 用户要求“查看当前记录 / 编辑当前记录 / 本条记录 / 这一行”时，只有在 live `catalog.blocks[].resourceBindings` 明确暴露 `currentRecord` 时，才默认继续在 `popup-content` 下创建 `details(currentRecord)` 或 `editForm(currentRecord) + submit`。
- 如果 popup catalog 没有暴露 `currentRecord`，停止猜测，不要在普通 popup 上臆造记录绑定。
- `currentRecord` 属于 popup 内 block 的资源绑定语义，不是复用页面上已有区块实例。
- popup 内 block 的 `resource` 一律按对象型 wire shape 写入，不接受字符串简写。`details/editForm(currentRecord)` 用 `{ "binding": "currentRecord" }`；popup 内的 association collection block 用 `{ "binding": "associatedRecords", "associationField": "<field>" }`。
- popup 里的关联 collection block 默认优先走语义化 `resource.binding="associatedRecords"`；写后必须确认 `resourceSettings.init.associationName` 是包含 `.` 的完整关联名，且 `sourceId` 仍然存在。若读回成裸字段名（例如 `roles`）或丢失 `sourceId`，视为失败并停止，不接受静默落盘。
- `openView.uid` 不是当前 skill 的默认写入手段；没有强证据时，不要主动用它做 popup 复用。
- upstream contract 已明确禁止把一个 opener 的 uid 直接拿去给另一个 opener 复用；尤其不要把一个入口的 popup uid 写到另一个入口的 `openView.uid`。
- 如果用户明确要求复用现有 popup，只能在 live 事实已经证明该 uid 合法、存在、且不指向 page/tab/popup subtree 节点时再单独判断；否则默认停止，不猜。
- association field 的 `openView.collectionName` 默认保持目标 collection 语义；不要把 association popup 改写成源 collection 来伪装“当前行详情”。
- association field 开启 `clickToOpen/openView` 时，`openView` 不能只剩目标 `collectionName`；写后必须确认 `associationName` 仍存在。对 to-many association field，若读回后只剩 `collectionName='roles'` 这类 plain target collection 语义，说明 popup 会丢失关联上下文。
- 如果你是在 association field 上故意配置 non-association-field popup，不要自动保留旧的 `associationName`。当 `collectionName/dataSourceKey` 明确切到别的记录语义时，读回不应再带旧关联名；如果仍想打开同一个 target collection 但要求 plain popup，显式传 `associationName: null`。
- 如果 association field popup 里再创建 `details(currentRecord)`、`editForm(currentRecord)` 或它们内部的 record action popup，写后必须继续确认 `resourceSettings.init` 保留完整 `associationName` 与 `sourceId`。缺任何一个，都意味着后续弹窗会把 association record 误当成普通目标表记录。

## 默认 popup 写流程

1. 先判断本次是否命中 `guard-first popup flow`。命中时先创建 opener 或 popup shell，拿到 popup uid；未命中时可直接按 [tool-shapes.md](./tool-shapes.md) 的 inline popup payload 完成 subtree。
2. 如果写接口直接返回了 popup 相关 uid，优先复用这些 new target，不要重新猜 host。
3. 明确本次写的是 `popup-page`、`popup-tab` 还是 `popup-content`。
4. 命中 `guard-first popup flow` 时，先按 [normative-contract.md](./normative-contract.md) 的 `Catalog Contract` 读取 `popup-content` 的 `catalog`，确认 `resourceBindings` 或字段能力后再继续 `compose/add*`。
5. 写后按 [verification.md](./verification.md) 做 popup 专项 `readback`。

association field popup 的最小验收：

1. opener 的 `stepParams.popupSettings.openView` 读回后仍有完整 `associationName`。
2. popup 内 `details/editForm(currentRecord)` 的 `resourceSettings.init` 读回后同时包含 `associationName` 与 `sourceId`。
3. 如果 popup 里还有下一层 record action popup，继续用同样标准检查下一层 `details/editForm(currentRecord)`，直到链路结束。

## Record Popup Recipes

### 查看当前记录：`recordActions.view -> details(currentRecord)`

1. 在 `table/details/list/gridCard` 上创建 `recordActions.view`。
2. 复用写接口返回的 `popupGridUid`。
3. 因为这里要判定 `currentRecord` guard，先按 [normative-contract.md](./normative-contract.md) 读取 `popup-content` 的 `catalog`。
4. 只有 guard 通过时，才创建 `details(currentRecord)`。
5. 写后确认 popup 内容里实际出现 `details`，而不是只剩空 shell；如果现场 `get/catalog` 可见 resource binding，再额外确认它真的绑定到了 `currentRecord`。

### 编辑当前记录：`recordActions.edit -> editForm(currentRecord) + submit`

1. 在 `table/details/list/gridCard` 上创建 `recordActions.edit`。
2. 复用写接口返回的 `popupGridUid`。
3. 因为这里要判定 `currentRecord` guard，先按 [normative-contract.md](./normative-contract.md) 读取 `popup-content` 的 `catalog`。
4. 只有 guard 通过时，才创建 `editForm(currentRecord)` 并补 `submit`。
5. 写后确认 popup 内容里实际出现 `editForm` 与 `submit`；如果现场 `get/catalog` 可见 resource binding，再额外确认 `editForm` 绑定的是 `currentRecord`，且 `submit` 仍挂在该 form 下。

## `openView` vs popup action

| 用户意图 | 优先能力 | 关注点 |
| --- | --- | --- |
| 字段点击打开详情 | `clickToOpen + openView` | 先读回 association field uid |
| 记录级查看/编辑按钮 | `recordActions.view/edit/popup` | 创建 action 后还要继续搭 popup 内容，并确认是否可用 `currentRecord` |
| 动作按钮弹窗 | popup action | popup target 来自 action 写接口 |
| 抽屉打开 | `openView.mode = "drawer"` 或 popup drawer | 先判断触发源是字段还是 action |
| 普通弹窗打开 | `openView.mode = "dialog"` 或 popup action | 字段来源优先 openView，action 来源优先 popup |

常见字段 `openView` 改法：`clickToOpen`、`openView.mode`、`openView.collectionName`。

## `linkageRules` 与 `flowRegistry`

- `linkageRules` 属于具体 settings 域；`flowRegistry` 属于节点实例级事件流配置域，标准入口是 `setEventFlows`。
- 不要混淆：`linkageRules` 不是 `flowRegistry`，`flowRegistry` 也不是可以脱离 contract 猜 path 的普通 settings patch。
- `setEventFlows` 属于 high-impact full-replace API；必须先读当前 flows，只在用户明确接受整体替换时使用，并在写后按完整 flow 状态验收。
- 推荐顺序：`get -> catalog -> 写 popup/openView settings 或 linkageRules`；只有在用户明确接受整体替换、且你已先读当前 flows 时，才继续 `setEventFlows -> readback`。
- 如果 popup settings 被清空，但 flow 仍引用旧 path，优先修正 settings 或 flow 引用，不要强行猜兼容路径。
