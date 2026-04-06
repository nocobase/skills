---
name: nocobase-ui-builder
description: 当用户要通过 NocoBase MCP / FlowSurfaces 检查、创建、修改、重排或删除 Modern page (v2) 的菜单分组、菜单项、页面、页签、弹窗、布局，以及 block / field / action 配置时使用；不负责浏览器复现、ACL、数据建模或 workflow 编排。
allowed-tools: Bash, Read, All MCP tools provided by NocoBase server
---

# Start Here

- 默认入口先看 [execution-checklist.md](./references/execution-checklist.md)。它只压缩主执行链，不新增规则。
- 已经知道 `target family` / locator / write target 时，再看 [runtime-playbook.md](./references/runtime-playbook.md)。
- 只差 MCP payload shape 时，再看 [tool-shapes.md](./references/tool-shapes.md)。
- 命中 `popup`、`chart`、`js` 任务时，再按需进入对应专题 gate。

## Ownership

- `agents/openai.yaml` 只负责 skill 唤起与最小护栏，不重复维护详细规则。
- `SKILL.md` 维护全局规则、风险分级、stop conditions 与主执行表。
- [execution-checklist.md](./references/execution-checklist.md) 只做压缩导航，不定义新的 contract。
- 各 `references/*.md` 维护各自专题 contract；若与压缩导航表达粒度不同，以本文件和专题 reference 为准。

# Goal

稳定完成 Modern page (v2) 的 inspect / build / update / reorder / delete。涉及写入时，默认做最小必要 `readback`。

## Prerequisite & Recovery

- 执行写入前，NocoBase MCP 必须可达且已认证；若现场返回认证错误、关键 tool 缺失或 capability gap，先停止写入。
- MCP 不可用、未认证或 schema 未刷新时，优先提示用户走 `nocobase-mcp-setup` 或刷新当前 MCP 连接，再继续本 skill。
- `desktop_routes_list_accessible(tree=true)` 只代表**当前角色可见菜单树**，不是系统全量菜单真相；“没看到”不能直接推断为“系统不存在”。
- `get/catalog/context` 缺少关键能力或 guard 时，不做猜测写入；只有用户明确接受时，才允许退化到 popup shell 这类保守 fallback，其余情况统一报告 capability gap 并停止。

## Scope & Terms

- 只处理与 Modern page (v2) 直接相关的 `group / flowPage / page / tab / popup / content` surface，以及内容区里的 block / field / action / layout / configuration。
- 不处理非 Modern page 的 desktop routes、工作台其它导航结构、浏览器 validation case 复现、页面报错复盘，以及 workflow / ACL / 数据建模细节。
- 显式转交：
  - ACL / 路由权限 / 角色权限 → `nocobase-acl-manage`
  - collection / relation / field schema authoring → `nocobase-data-modeling`
  - 消费现有 schema 做 UI resource binding → 保留在本 skill
  - workflow create / update / revision / execution path → `nocobase-workflow-manage`
- `target family`：当前目标属于哪类 surface；统一用 `menu-group`、`menu-item`、`page`、`outer-tab`、`route-content`、`popup-page`、`popup-tab`、`popup-content`、`node`。
- `pre-init ids`：`createMenu(type="item")` 返回、但尚未完成 `createPage(menuRouteId=...)` 初始化的 page / tab / route 相关 id；它们还不是 page/tab lifecycle 的 write-ready target。
- `已初始化页面`：已经执行过 `createPage(menuRouteId=...)`，可以继续使用 page/tab lifecycle API 的页面。
- `readback`：写入后的最小必要读回，用来确认结构、路由、popup subtree 或配置是否真的落盘。

## Tool Families

- 允许写入：`flow_surfaces_*`
- 允许读取：`flow_surfaces_get`、`flow_surfaces_catalog`、`flow_surfaces_context`、`desktop_routes_list_accessible(tree=true)`
- 明确禁止用来替代 UI mutation：`resource_*`、`collections_*`、`workflows_*`、`flow_nodes_*`、`roles_*` 以及底层 route 记录写入

## Hard Rules & Stop Conditions

1. live MCP tool schema，以及现场 `get` / `catalog` / `context` / `readback`，优先于本地文档。
2. `inspect` 默认只读；只有用户明确要求创建、修改、重排或修复时才进入写流程。
3. UI structure mutation 只走 `flow_surfaces_*`；菜单树发现只走 `desktop_routes_list_accessible(tree=true)`，并始终记住它只覆盖当前角色可见菜单。
4. 定位不唯一不猜；菜单标题只接受唯一命中的 `group`；如果 target 只能靠 sibling 相对位置推断，就先收敛唯一 target；`createMenu(type="item")` 之后必须先 `createPage(menuRouteId=...)`，其返回前的 `pre-init ids` 不是 page/tab lifecycle 的 write-ready target。
5. 已有 target 的写入默认走 `get -> catalog -> write -> readback`；只有刚由写接口直接返回的下一个 target uid，才允许跳过一次前置 `get`。
6. 写入路径按风险分级处理：`compose/add*` = safe append；`configure/updateSettings` = merge-like config；`setLayout/setEventFlows` = high-impact full-replace；`destroyPage/remove*`、`apply(mode="replace")` 与 replace-style `mutate` = destructive。high-impact 与 destructive 都要求用户明确接受影响范围；若用户不是在要求整体替换，就不要选 `setLayout/setEventFlows`。
7. 遇到认证不足、schema 未刷新、capability / contract / guard 缺失时停止猜测；批量写任一子项失败就停，并分别报告成功项与失败项，不自动 rollback，也不继续执行依赖“全部成功”的后续写入；服务端 contract / validation error 只允许一次 `refresh/get/catalog/context -> 重算 payload -> 重试`，第二次仍失败就按 capability gap / drift 收口。
8. 任何 JS 写入都必须先通过本地 validator gate；若 validator 不可运行、Node 版本不满足、结果不可判定，统一停止，不允许跳过 validator 直接调用 MCP。

## Execution Table

先确定 primary intent，再按需叠加下方 `Special Gates`；不要让专题 gate 反过来覆盖主链路。

| 任务 | 默认先读 | 追加 gate | 主写路径 | 验证 |
| --- | --- | --- | --- | --- |
| `inspect` | 菜单标题场景先读菜单树；已初始化 surface 默认 `get` | 只有用户明确要 capability / contract 时才追加 `catalog` | 无写入 | [verification.md](./references/verification.md) 的 `Inspect` |
| `create-page` | 先发现或创建父菜单；需要 uid / locator 时看 [runtime-playbook.md](./references/runtime-playbook.md) | 通常无；涉及 chart / js / popup 再叠加专题 gate | `createMenu(type="item") -> createPage(menuRouteId=...)`；兼容模式 `createPage` 不带 `menuRouteId` 只在用户明确接受副作用时允许 | `createPage` 总是升级为 `get({ pageSchemaUid })` readback，再按需读菜单树 |
| `update-ui` | `get -> catalog`；自然语言歧义时再看 [aliases.md](./references/aliases.md) | `popup` / `chart` / `js` 按需追加 | 默认先选 `compose/add*`，再考虑 `configure/updateSettings`；只有用户明确接受整体替换时才允许 `setLayout/setEventFlows` | 直接父级或直接 target readback；high-impact 走完整状态校验 |
| `move-menu` | 已知 `menuRouteId` 直接移动；只给菜单标题时先读菜单树 | 通常无 | `updateMenu(parentMenuRouteId=...)` | 菜单树读回挂接位置 |
| `reorder` | 先 `get` 确认 sibling 与目标定位 | popup tab 场景再读 popup subtree | `moveTab` / `movePopupTab` / `moveNode` | 父级或 route/tree readback |
| `delete-ui` | 先 `get` / 菜单树明确目标与影响范围 | 通常无 | `destroyPage` / `removeTab` / `removePopupTab` / `removeNode`；`apply(mode="replace")` 或 replace-style `mutate` 只在用户明确要求替换 subtree 时允许 | [verification.md](./references/verification.md) 的 destructive / high-impact readback |

## Special Gates

| 专题 | 什么时候追加读取 | 关键要求 | 主 reference |
| --- | --- | --- | --- |
| `popup` | 涉及 action popup、record popup、`openView`、`currentRecord` | 先确认 popup family 与 `currentRecord` guard；relation popup / `associatedRecords` / opener 复用限制统一看 popup 专题 | [popup.md](./references/popup.md) |
| `chart` | 涉及 chart block 的创建、重配、SQL / custom visual / events | 先从 chart 总入口分流；运行期搭建 / 重配 / readback 看 `chart-core`，contract matrix / 回归案例看 `chart-validation` | [chart.md](./references/chart.md) |
| `js` | 涉及 JS `code`、`renderer: "js"`、`jsBlock/jsColumn/jsItem/js action` 或 chart raw code | 必须先过本地 validator gate；skill canonical 调用统一走 validate-only 的 `--skill-mode`，不允许 live network | [js.md](./references/js.md) |

## Reference Roles

- [execution-checklist.md](./references/execution-checklist.md)：默认入口；把 preflight、主链路、risk gate、topic gate 与 stop/handoff 压缩成一页式执行清单。
- [verification.md](./references/verification.md)：`inspect`、写后 `readback`、batch / high-impact / destructive 的验收标准。
- [runtime-playbook.md](./references/runtime-playbook.md)：`target family`、locator、`pre-init ids`、write target 与 lifecycle 心智。
- [capabilities.md](./references/capabilities.md)：block / form / action / field 选型，以及 display vs relation field 的默认设计。
- [settings.md](./references/settings.md)：`add* + settings`、`configure`、`updateSettings` 的唯一选择规则。
- [tool-shapes.md](./references/tool-shapes.md)：flow surfaces 请求 envelope、canonical payload，以及 high-impact API 的请求形状。
- [popup.md](./references/popup.md)：`currentRecord`、relation popup、`associatedRecords`、`openView` 与 popup opener 规则。
- [chart.md](./references/chart.md)：chart 总入口与分流说明。
- [js.md](./references/js.md)：RunJS validator gate、model mapping、上下文语义与代码风格；CLI 细节再看 [runjs-runtime.md](./references/runjs-runtime.md)。
- [aliases.md](./references/aliases.md)：高歧义自然语言表达如何先收敛到对象语义或能力。
