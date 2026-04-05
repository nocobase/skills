---
name: nocobase-ui-builder
description: 当用户要通过 NocoBase MCP 检查、搭建、修改、重排或删除 Modern page (v2) 的菜单、页面、页签、弹窗，以及区块/字段/动作时使用；默认走 FlowSurfaces；不负责浏览器复现、页面报错复盘、ACL、数据建模与工作流细节。
allowed-tools: Bash, Read, All MCP tools provided by NocoBase server
---

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
4. 不要用 `resource_*` / generic CRUD / 底层 route 记录写入来替代 page、tab、popup、block、field、action 的 surface API。
5. 菜单标题不唯一不猜；只接受菜单树里唯一命中的 `group` 作为父菜单。
6. 已有 target 的写入默认走 `get -> catalog -> write -> readback`；只有刚由写接口直接返回的下一个 target uid，才允许跳过一次前置 `get`。
7. `addBlock` / `addField` / `addAction` / `addRecordAction` 默认优先把 live `catalog.configureOptions` 里能表达的公开语义字段直接写进 `requestBody.settings`；不要把 `props` / `decoratorProps` / `stepParams` / `flowRegistry` 当成 `settings` 的输入形状。JS raw code 与 chart contract 属于专题入口，不适用这条“优先塞进 settings”的默认心智。
8. 如果 `settings` 已经能完整表达用户要求，不要额外再补一次 `configure`；只有仍有剩余公开字段时，才执行 `add* + settings -> configure(changes)`。涉及 JS 时默认先过 validator gate，再进入 `configure`。
9. popup 里的关联 collection block 默认优先走语义化 `resource.binding="associatedRecords"`；写后 `readback` 必须确认 `resourceSettings.init.associationName` 是包含 `.` 的完整关联名，且 `sourceId` 仍然存在。若读回成裸字段名（例如 `roles`）或丢失 `sourceId`，视为失败并停止，不接受静默落盘。
10. 如果现场 `get/catalog/context` 没有明确暴露目标能力、target 绑定字段、resource binding、settings contract 或 `currentRecord` guard，停止猜测，不要臆造写入；只有文档显式允许的保守 fallback（例如用户明确接受仅保留 popup shell）才能继续。
11. 如果 target 只能靠同一 `parent/subKey` 下多个相同 `use/type` sibling 的相对位置来猜，先停止并收敛唯一 target。
12. page lifecycle 顺序不能乱：`createMenu(type="item")` 之后，先 `createPage(menuRouteId=...)` 初始化页面，再使用 page/tab lifecycle API。
13. `pre-init ids` 在 `createPage(menuRouteId=...)` 完成前，只能继续用于初始化链路，不能当成 page/tab lifecycle 的 write-ready target。
14. 批量写不是默认首选；若使用 `addBlocks/addFields/addActions/addRecordActions`，必须逐项检查 `ok/error/index`，任一失败即停，不能只靠父容器 `readback` 判成功。
15. `destroyPage`、`removeTab`、`removePopupTab`、`removeNode`、`apply(mode="replace")`，以及会删除 / 替换现有 subtree 的 `mutate` 组合属于 destructive path；只有用户明确要求删除 / 替换时才执行，并先说明影响范围。
16. `openView.uid` 不允许作为写入输入来复用已有 popup opener；如果用户要求多个 opener / field / action 打开同一个弹窗，停止并提示该 skill 不支持 popup 复用，必须为每个 opener 单独创建 popup subtree。
17. 认证不足、关键接口缺失或 MCP schema 未刷新时，先按 `Prerequisite & Recovery` 收口，不要绕过 MCP 专用接口。

## Intent Router

先确定 primary intent，再按需叠加下方的 `Special Gates`；不要让专题 gate 反过来覆盖主链路。

| 任务 | 先读什么 | 主写入口 | 主 reference |
| --- | --- | --- | --- |
| `inspect` | 菜单标题场景先读菜单树；已初始化 surface 默认 `get`，必要时再 `catalog` | 无写入 | [verification.md](./references/verification.md) |
| `create-page` | 先发现或创建父菜单，再初始化页面 | `createMenu(type="item") -> createPage(menuRouteId=...)` | [runtime-playbook.md](./references/runtime-playbook.md) |
| `update-ui` | `get -> catalog`；自然语言歧义时再看 aliases | `compose` / `add* + settings` / `configure` / `updateSettings` | [capabilities.md](./references/capabilities.md) |
| `move-menu` | 已知 `menuRouteId` 直接移动；只给菜单标题时先读菜单树 | `updateMenu(parentMenuRouteId=...)` | [runtime-playbook.md](./references/runtime-playbook.md) |
| `reorder` | 先 `get` 确认 sibling 与目标定位 | `moveTab` / `movePopupTab` / `moveNode` | [runtime-playbook.md](./references/runtime-playbook.md) |
| `delete-ui` | 先 `get` / 菜单树明确目标与影响范围 | `destroyPage` / `removeTab` / `removePopupTab` / `removeNode` | [verification.md](./references/verification.md) |

## Special Gates

| 专题 | 什么时候追加读取 | 关键要求 | 主 reference |
| --- | --- | --- | --- |
| `popup` | 涉及 action popup、record popup、`openView`、`currentRecord` | 先确认 popup family 与 `currentRecord` guard，再决定是否创建 record-bound 内容 | [popup.md](./references/popup.md) |
| `chart` | 涉及 chart block 的创建、重配、SQL / custom visual / events | 创建 chart 时先建 block；builder query 先读 `path="collection"` 选字段，写入 `query` 后再读 `path="chart"` 收敛 `queryOutputs/mappings`；重配已有 chart 时可直接读 `path="chart"`；维护期 contract case 另看 validation 文档 | [chart-core.md](./references/chart-core.md) |
| `js` | 涉及 JS `code`、`renderer: "js"`、`jsBlock/jsColumn/jsItem/js action` 或 chart raw code | 必须先过本地 validator gate；skill canonical 调用统一走 validate-only 的 `--skill-mode`，不允许 live network | [js.md](./references/js.md) |

## Read Order

### 默认先读

- [verification.md](./references/verification.md)：`inspect` 流程、写后 `readback`、断言升级条件。
- [runtime-playbook.md](./references/runtime-playbook.md)：target family、locator、write target 与默认写流程。
- 如果任务涉及 `chart` 区块写入，进入写流程前先读 [chart-core.md](./references/chart-core.md)，不要跳过。

### 按需再读

- [popup.md](./references/popup.md)：popup / `openView` / `currentRecord` guard / `flowRegistry` / record popup recipes。
- [capabilities.md](./references/capabilities.md)：block / form / action / field 的默认选型与 scope 规则；`filterForm` 的通用能力也看这里。
- [settings.md](./references/settings.md)：`addBlock/addField/addAction/addRecordAction` 如何直接内联公开 `settings`、何时回退到 `configure` / `updateSettings`。
- [tool-shapes.md](./references/tool-shapes.md)：flow surfaces 请求 envelope、`requestBody` 形状，以及 `setLayout` 的 canonical payload shape。
- [chart-validation.md](./references/chart-validation.md)：chart block 的 contract 验证 case、复杂矩阵与负例。
- [js.md](./references/js.md)：RunJS validator gate、model mapping、上下文语义与代码风格。
- [runjs-runtime.md](./references/runjs-runtime.md)：RunJS CLI 的 repo-root 入口、validate-only 约束、Node 版本、`--skill-mode` 与 runtime cwd 约定。
- [aliases.md](./references/aliases.md)：高歧义自然语言表达如何先收敛到对象语义或能力。
