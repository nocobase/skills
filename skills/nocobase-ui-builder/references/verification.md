# Verification

当你要做 `inspect`，或确认一次写入是否真的落盘时，读本文。family / locator / write target 看 [runtime-playbook.md](./runtime-playbook.md)，请求形状看 [tool-shapes.md](./tool-shapes.md)，popup 细节看 [popup.md](./popup.md)。`catalog` 是否必读、以及 `shell-only popup` 的成功措辞，统一看 [normative-contract.md](./normative-contract.md)。

## Inspect

### 核心规则

- `inspect` 只做只读检查，不调用任何写接口。
- 菜单标题发现链路默认先 `desktop_routes_list_accessible(tree=true)`；但它只代表当前角色可见菜单树，不是系统全量真相。已初始化 surface 默认先 `get`。
- 是否继续 `catalog`，统一按 [normative-contract.md](./normative-contract.md) 的 `Catalog Contract` 判断。
- `inspect` 输出应聚焦“当前结构、关键 uid / route / capability、阻塞点”，不要混用“写入成功 / 已落盘”措辞。

### 验收级别

- `structural-confirmed`：已通过菜单树 / `get` / route/tree 读回确认结构存在、位置正确、节点落盘。
- `semantic-confirmed`：除结构外，还通过 live capability / binding / context / code 一致性确认了目标语义。
- `partial/unverified`：写入返回成功，但现场读回不足以确认用户真正关心的语义；必须明确说明未完成验证。

### 最小读链

| 目标 family | 默认读取顺序 | 常见追加原因（仍以 normative contract 为准） |
| --- | --- | --- |
| `menu-group` | `desktop_routes_list_accessible(tree=true)` | 通常不需要 |
| `menu-item` | 菜单树；必要时再用 `routeId/pageSchemaUid` 做 `get` | 用户要看页面内部 capability，且该菜单项已初始化为 `flowPage` |
| `page` / `outer-tab` / `route-content` | `get` | 需要看 capability / contract / `configureOptions` / `settingsContract` |
| `popup-page` / `popup-tab` / `popup-content` | `get` | 需要看 popup 内可创建能力、`resourceBindings` 或 event/settings contract |
| `node` | `get` | 需要精确判断容器公开能力或 path-level contract |

### 只读断言

- 菜单：唯一命中、`routeId/type/parentMenuRouteId` 清晰、`menu-item` 是否已初始化。
- 页面 / `outer-tab`：`pageSchemaUid/tabSchemaUid/routeId` 可定位，标题 / 图标 / documentTitle / 顺序清晰，必要时已拿到 `gridUid`。
- `route-content` / popup subtree / 普通节点：`tree/nodeMap` 是否包含目标 block / field / action；popup subtree 是否已有 `popupPageUid/popupTabUid/popupGridUid`；如果用户关心“当前记录”，是否真的从 live `catalog.blocks[].resourceBindings` 看到了 `currentRecord`。

## Write Readback

### 使用原则

- 写后只核对本次变更直接相关的 target；只有生命周期或 route/tree 层级变化时，才升级为完整校验。
- 菜单写入优先核对 `routeId/type/parentMenuRouteId`；菜单移动升级为菜单树读回，而不是 flow tree 校验。
- popup、字段、配置断言都以现场读回为准；不要只看写接口返回值就认为完成。
- `shell-only popup` 只能验收为 `structural-confirmed`；不要把它表述成 popup 内容已完成。
- 批量写不是默认首选；若使用 `addBlocks/addFields/addActions/addRecordActions`，必须逐项检查返回里的 `ok/error/index`，任一失败即停，并分别报告成功项 / 失败项；不自动 rollback，也不继续执行依赖“全部成功”的后续写入。
- `setLayout` 与 `setEventFlows` 属于 high-impact full-replace；写前先读当前完整状态，写后按完整 layout / flow 状态验收，不按局部 delta 判成功。
- `destroyPage`、`removeTab`、`removePopupTab`、`removeNode`、`apply(mode="replace")`，以及会删除 / 替换现有 subtree 的 `mutate` 组合属于 destructive path；执行前先说明影响范围，读回时优先确认删除/替换边界是否与预期一致。

### 操作 -> 最小读回目标

| 操作 | 最小读回目标 | 何时升级为完整 route/tree 校验 |
| --- | --- | --- |
| `createMenu(type="group")` | 返回值；必要时菜单树读回 | 指定父菜单，或后续要继续挂接页面 |
| `createMenu(type="item")` | 返回值；如用户只要菜单入口则读菜单树确认位置 | 后续紧接 `createPage(menuRouteId=...)` 时不单独升级 |
| `updateMenu` | 返回值；移动时读菜单树 | 改父级、按标题发现目标菜单，或要确认最终挂接位置 |
| `createPage` | `get({ pageSchemaUid })` | 总是升级 |
| `addTab/updateTab/moveTab/removeTab` | `page` 或对应 `outer-tab` | 总是升级 |
| `addPopupTab/updatePopupTab/movePopupTab/removePopupTab` | `popup-page` 或对应 `popup-tab` | 总是升级 |
| `compose/addBlock/addField/addAction/addRecordAction` | 直接父级 / 直接容器 target | 不升级 |
| `configure/updateSettings` | 被修改的 target；必要时读直接父级 | 不升级 |
| `setLayout` | 目标容器 + 完整 `rows/sizes/rowOrder` 状态 | 总是按完整布局校验 |
| `setEventFlows` | 被修改的 target + 完整 flow 状态 | 总是按完整 flow 状态校验 |
| `apply/mutate` | 直接受影响 target；如涉及 subtree 层级变化，再读父级 | 仅结构层级真的改变时升级 |

### 读回重点

- 菜单：`routeId` 类型正确，`parentMenuRouteId`、标题、图标、tooltip、`hideInMenu` 同步；`createMenu(type="item")` 后不要误判为已初始化页面。
- 页面 / `outer-tab`：page route/tab route 存在且顺序正确；如果现场可见，`pageRoute.options.flowSurfacePageInitialized = true`；新增 tab 补齐对应 grid anchor。
- `popup-tab`：popup page 仍存在，tab 数量与顺序正确，`tree.use = ChildPageTabModel`，新增 tab 补齐对应 grid anchor。
- popup subtree：确认 `popupPageUid/popupTabUid/popupGridUid` 挂在正确位置；如果本次目标只是 `shell-only popup`，这里最多记为 `structural-confirmed`；如果场景是查看或编辑当前记录，`popupGridUid` 下不能只是空 shell，且若现场能看到 resource binding，再额外确认 `details/editForm` 绑定的是 `currentRecord`，才能记为 `semantic-confirmed`。
- 结构 / 字段 / 配置：`tree/nodeMap` 能找到新增节点；table 的 `actionsColumnUid` 存在；record popup 的 `details/editForm/submit` 真正出现；字段定位到 `wrapperUid/fieldUid/innerFieldUid`；`flowRegistry`、layout、association field `clickToOpen/openView` 已落盘。
- `setLayout`：`rows/sizes/rowOrder` 完整匹配预期，且 child 覆盖与列宽数量一致；不要只看单个 child 是否还在。
- `setEventFlows`：最终 flow 集合必须完整匹配预期，不残留旧 flow，也不丢失本次目标范围内应保留的绑定。
- 直接 to-many association display field：如果用户加的是 `users.roles` 这类 details/list/gridCard 字段，读回时确认它没有退化成 sub-table 类 use；必要时继续确认 `fieldSettings.init.fieldPath` 已归一到 association field 本身（例如 `roles` 而不是 `roles.title`）且 `titleField` 落盘。
- `filterForm` 接线：不要只看 `addField` 返回值，也不要只看 filter field 自身是否存在；多目标场景下，推荐把父级内容容器读回里的 `filterManager` 当成常用成功信号，并在现场可见时一并核对字段级 target 绑定信息（例如 `defaultTargetUid`）是否符合预期。
- RunJS：除了 UI 结构读回，还要确认最终落盘 `code` 与通过 validator gate 的代码完全一致。
