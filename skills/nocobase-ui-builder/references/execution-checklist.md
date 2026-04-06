# Execution Checklist

执行时默认按这份清单走；只有命中特定 contract 时，才继续打开对应专题 reference。`catalog`、popup shell fallback、schema drift / recovery 的跨专题规则统一看 [normative-contract.md](./normative-contract.md)。

## 1. Preflight

- 写入前先确认 NocoBase MCP 可达、已认证、schema 可用。
- `inspect` 默认只读；只有用户明确要求创建、修改、重排、删除或修复时才进入写流程。
- 如果现场已经出现认证错误、关键 tool 缺失、schema 未刷新或 capability gap，先停止写入；恢复动作统一看 [normative-contract.md](./normative-contract.md)。

## 2. Choose Intent

- 先判主意图：`inspect`、`create-menu-group`、`create-page`、`update-ui`、`move-menu`、`reorder`、`delete-ui`。
- 只有真的命中 `popup`、`chart`、`js` 时才追加专题 gate。

默认路径速查：

| intent | 默认主路径 | 最小读回 |
| --- | --- | --- |
| `inspect` | 菜单标题先读菜单树；已初始化 surface 先 `get`；是否追加 `catalog` 按 [normative-contract.md](./normative-contract.md) | [verification.md](./verification.md) 的 `Inspect` |
| `create-menu-group` | `createMenu(type="group")`；需要挂到指定父级时补 `parentMenuRouteId` | 返回值；必要时菜单树 |
| `create-page` | `createMenu(type="item") -> createPage(menuRouteId=...)` | `get({ pageSchemaUid })` |
| `update-ui` | `get -> [按 normative contract 判断是否追加 catalog] ->` route-backed 元数据更新优先 `updateMenu` / `updateTab` / `updatePopupTab`；其余优先 `compose/add*`，再考虑 `configure/updateSettings` | 直接父级、直接 target，或对应 lifecycle target |
| `move-menu` | 已知 `menuRouteId` 时直接 `updateMenu(parentMenuRouteId=...)`；只有菜单标题时先读菜单树 | 菜单树 |
| `reorder` | `get` 收敛 sibling / target 后，走 `moveTab` / `movePopupTab` / `moveNode` | 父级、page 或 route/tree |
| `delete-ui` | `get` / 菜单树明确目标与影响范围后，走 `destroyPage` / `removeTab` / `removePopupTab` / `removeNode` | destructive / high-impact readback |

## 3. Resolve Family / Locator

- 菜单标题发现统一先走 `desktop_routes_list_accessible(tree=true)`；它只代表当前角色可见菜单树，不是系统全量真相；只接受唯一命中的 `group`。
- 已初始化 surface 默认先 `flow_surfaces_get`；根据现场定位字段选择 `uid`、`pageSchemaUid`、`tabSchemaUid`、`routeId`。
- family / locator / write target 的映射统一看 [runtime-playbook.md](./runtime-playbook.md)。
- target 仍然不唯一时停止，不猜 sibling 相对位置。

## 4. Choose Capability / Config Path

- 不确定该选 block / form / action / field 时，看 [capabilities.md](./capabilities.md)。
- 需要判断 `settings`、`configure(changes)`、`updateSettings` 的取舍时，看 [settings.md](./settings.md)。
- 自然语言有高歧义时，看 [aliases.md](./aliases.md) 先收敛对象语义。

## 5. Read Path

- 已有 surface 默认先 `get`；是否追加 `catalog`，统一按 [normative-contract.md](./normative-contract.md) 的 `Catalog Contract` 判断。
- `inspect` 只读；`get` / `catalog` / `context` 的请求形状统一看 [tool-shapes.md](./tool-shapes.md)。

## 6. Write Path

- 默认写链：`get -> [按 normative contract 决定是否追加 catalog] -> write -> readback`。
- 只创建菜单分组时，直接走 `createMenu(type="group")`。
- 新建页面默认菜单优先：`createMenu(type="item") -> createPage(menuRouteId=...)`。
- 已有 target 优先 `compose/add*`，再考虑 `configure/updateSettings`；只有刚由写接口直接返回的下一个 target uid，才允许跳过一次前置 `get`。
- 具体操作对应的最小读回目标，统一对照 [verification.md](./verification.md) 的 `操作 -> 最小读回目标`。

## 7. Risk Gate

- `add*` 与 `compose(mode != "replace")` = append-like；`configure/updateSettings` = merge-like。
- `setLayout/setEventFlows` = high-impact full-replace。
- `destroyPage/remove*`、`apply(mode="replace")`、`compose(mode="replace")`、replace-style `mutate` = destructive。
- high-impact / destructive 都先说明影响范围；用户不是在要求整体替换时，不要默认走这些路径。

## 8. Topic Gate

- `popup`：看 [popup.md](./popup.md)。
- `chart`：先看 [chart.md](./chart.md)，再按需进入 `chart-core` / `chart-validation`。
- `js`：看 [js.md](./js.md)；任何 JS 写入都必须先走本地 validator gate，CLI 入口看 [runjs-runtime.md](./runjs-runtime.md)。

## 9. Retry / Batch Failure

- 服务端 contract / validation error 若指向 schema drift / capability gap，按 [normative-contract.md](./normative-contract.md) 收口；当前不定义抽象 `refresh -> retry` 链路。
- 批量写任一子项失败即停；分别报告成功项 / 失败项，不自动 rollback，不继续依赖“全部成功”的后续写入；写后验收看 [verification.md](./verification.md)。

## 10. Stop / Handoff

- 遇到认证不足、schema 未刷新、capability / contract / guard 缺失、target 不唯一、validator 不可判定时，停止猜测写入；恢复动作统一看 [normative-contract.md](./normative-contract.md)。
- ACL / 路由权限 / 角色权限 → `nocobase-acl-manage`
- collection / relation / field schema authoring → `nocobase-data-modeling`
- workflow create / update / revision / execution path → `nocobase-workflow-manage`
