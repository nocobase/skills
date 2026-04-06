# Execution Checklist

默认从这份清单进入。它只压缩 `nocobase-ui-builder` 的主执行链，**不定义新规则**；细节一律回到 `SKILL.md` 和专题 reference。

## 1. Preflight

- 写入前先确认 NocoBase MCP 可达、已认证、schema 可用。
- `inspect` 默认只读；只有用户明确要求创建、修改、重排、删除或修复时才进入写流程。
- 如果现场已经出现认证错误、关键 tool 缺失、schema 未刷新或 capability gap，先停止写入并走恢复链路。

## 2. Choose Intent

- 先判主意图：`inspect`、`create-page`、`update-ui`、`move-menu`、`reorder`、`delete-ui`。
- 主链路看 [SKILL.md](../SKILL.md) 的 `Execution Table`；只有真的命中 `popup`、`chart`、`js` 时才追加专题 gate。

## 3. Resolve Family / Locator

- 菜单标题发现统一先走 `desktop_routes_list_accessible(tree=true)`；它只代表当前角色可见菜单树，不是系统全量真相；只接受唯一命中的 `group`。
- 已初始化 surface 默认先 `flow_surfaces_get`；根据现场定位字段选择 `uid`、`pageSchemaUid`、`tabSchemaUid`、`routeId`。
- family / locator / write target 的映射统一看 [runtime-playbook.md](./runtime-playbook.md)。
- target 仍然不唯一时停止，不猜 sibling 相对位置。

## 4. Read Path

- 已有 surface 默认先 `get`；只有用户明确要 capability / contract，或仅靠 `get` 不够时才追加 `catalog` / `context`。
- `inspect` 只读；`get` / `catalog` / `context` 的请求形状统一看 [tool-shapes.md](./tool-shapes.md)。

## 5. Write Path

- 默认写链：`get -> catalog -> write -> readback`。
- 新建页面默认菜单优先：`createMenu(type="item") -> createPage(menuRouteId=...)`。
- 已有 target 优先 `compose/add*`，再考虑 `configure/updateSettings`；只有刚由写接口直接返回的下一个 target uid，才允许跳过一次前置 `get`。

## 6. Risk Gate

- `compose/add*` = safe append；`configure/updateSettings` = merge-like。
- `setLayout/setEventFlows` = high-impact full-replace。
- `destroyPage/remove*`、`apply(mode="replace")`、replace-style `mutate` = destructive。
- high-impact / destructive 都先说明影响范围；用户不是在要求整体替换时，不要默认走这些路径。

## 7. Topic Gate

- `popup`：看 [popup.md](./popup.md)。
- `chart`：先看 [chart.md](./chart.md)，再按需进入 `chart-core` / `chart-validation`。
- `js`：看 [js.md](./js.md)；任何 JS 写入都必须先走本地 validator gate，CLI 入口看 [runjs-runtime.md](./runjs-runtime.md)。

## 8. Retry / Batch Failure

- 服务端 contract / validation error 只允许一次 `refresh/get/catalog/context -> 重算 payload -> 重试`。
- 批量写任一子项失败即停；分别报告成功项 / 失败项，不自动 rollback，不继续依赖“全部成功”的后续写入；写后验收看 [verification.md](./verification.md)。

## 9. Stop / Handoff

- 遇到认证不足、schema 未刷新、capability / contract / guard 缺失、target 不唯一、validator 不可判定时，停止猜测写入。
- ACL / 路由权限 / 角色权限 → `nocobase-acl-manage`
- collection / relation / field schema authoring → `nocobase-data-modeling`
- workflow create / update / revision / execution path → `nocobase-workflow-manage`
