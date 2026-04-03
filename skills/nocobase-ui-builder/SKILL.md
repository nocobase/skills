---
name: nocobase-ui-builder
description: 当用户要通过 NocoBase MCP 从自然语言以菜单优先方式搭建、修改、重排或只读检查 Modern page (v2) UI surface 时使用；覆盖与 Modern page(v2) 相关的菜单 `group/item`、route-backed `page` / `outer-tab` / `route-content`、popup subtree，以及内容区内的 block/field/action/layout/configuration；不负责浏览器 validation case 复现或页面报错复盘。
allowed-tools: Bash, Read, All MCP tools provided by NocoBase server
---

# Goal

稳定完成与 Modern page(v2) 相关的菜单、页面、route-backed tab、popup subtree 的搭建、修改、重排与只读检查；涉及写入时，在写后通过运行时读回或菜单树读回确认结果。

# Quick Start

| 任务 | 先读什么 | 常用 target family | 首选接口 | 最小读回 |
| --- | --- | --- | --- | --- |
| `inspect` | 已初始化 surface 默认 `get`；用户只给菜单标题时先读菜单树，再按需 `get/catalog` | 按现场对象落到 `menu-*` / `page` / `outer-tab` / `route-content` / `popup-*` / `node` | `desktop_routes_list_accessible` / `get`，必要时 `catalog` | 不进入写后验证 |
| 新建菜单分组 | 如用户只给父菜单标题，先读菜单树定位唯一 `group` | `menu-group` | `createMenu(type="group")` | 返回值；必要时菜单树读回 |
| 新建 page | 先发现或创建父菜单，再创建可绑定菜单项，最后初始化页面 | 先 `menu-item`，后 `page` / `route-content` / `outer-tab` | `createMenu(type="item") -> createPage(menuRouteId=...) -> catalog -> compose/configure/add*` | `get({ pageSchemaUid })`，并做完整 route/tree 校验 |
| 把页面移入某个菜单 | 已知 `menuRouteId` 直接移动；只给菜单标题时先读菜单树定位唯一 `group` | `menu-item` / `page` | `updateMenu(parentMenuRouteId=...)` | 返回值；移动时升级为菜单树读回 |
| 已有 target 搭建或修改 | `get -> catalog` | 通常是 `route-content` / `popup-content` / `node` | `compose` / `configure` / `add*` | 读回直接受影响 target |
| `reorder` | 先 `get` 确认 sibling 与目标定位 | `page` / `popup-page` / `node` | `moveTab` / `movePopupTab` / `moveNode` | tab / popup-tab 做 route/tree 校验；普通节点读父级或直接受影响 target |
| record popup 查看/编辑 | `get(owner) -> catalog(owner)`，创建 action 后再 `catalog(popup-content)` | 先 `node`，后 `popup-content` | `addRecordAction -> compose/add*` | popup subtree + `popup-content` |

record popup 只有在 live `catalog.blocks[].resourceBindings` 明确暴露 `currentRecord` 时，才默认创建 `details(currentRecord)` 或 `editForm(currentRecord)`；否则停止猜测，不写入。

# Dependency Gate

- NocoBase MCP 必须可达且已认证。
- 如果 MCP 返回认证错误，不要尝试自行登录；让用户先修复 NocoBase MCP 认证，再继续。
- 如果本次目标依赖尚不存在的 collection、relation、selector 资源，先转给 `nocobase-data-modeling`，完成后再继续 UI surface 搭建。
- 如果本次目标依赖尚未配置好的 workflow action / trigger / execution path，先转给 `nocobase-workflow-manage`，完成后再继续 UI surface 搭建。
- 如果用户要做浏览器 validation case 复现、页面报错复盘或运行时 UI 验证，这不属于本 skill 范围。

# Mandatory MCP Gate

| 任务 | 最小接口集合 |
| --- | --- |
| `inspect` | 已初始化 surface 需要 `flow_surfaces_get`；只有要看 capability / contract 时才需要 `flow_surfaces_catalog`；如果用户只给菜单标题，还要有 `desktop_routes_list_accessible` |
| 新建菜单 / page | `flow_surfaces_create_menu`、`flow_surfaces_create_page`、`flow_surfaces_get`；如果用户只给父菜单标题，还要有 `desktop_routes_list_accessible`；如果继续搭内容，还要有 `flow_surfaces_catalog` 与至少一种写接口 |
| 移动 / 改名菜单 | `flow_surfaces_update_menu`；如果用户只给目标菜单标题，还要有 `desktop_routes_list_accessible` |
| 已有 target 搭建或修改 | `flow_surfaces_get`、`flow_surfaces_catalog`，以及至少一种目标写接口：`compose` / `configure` / `add*` / `updateSettings` / `setLayout` / `setEventFlows` / `apply` / `mutate` |
| `reorder` | `flow_surfaces_get`，以及对应的 `moveTab` / `movePopupTab` / `moveNode` |
| record popup 查看/编辑 | `flow_surfaces_get`、`flow_surfaces_catalog`、`flow_surfaces_add_record_action`，以及至少一种 popup 内容写接口：`compose` / `addBlock` / `addAction` |

- 如果当前 MCP 只暴露部分读接口或部分写接口，按现场能力收窄；缺少关键接口时，停止并说明 MCP 能力不足。
- 不要因为文档存在就假设接口一定可用。

# RunJS Writes

- 涉及 RunJS `code` 的写入，不是纯 MCP 流程；写入前必须先经过本地 validator gate。
- RunJS 的模型映射、上下文语义、校验方式与代码风格，统一看 [references/js.md](./references/js.md)。

# Scope

- 只处理与 Modern page(v2) 直接相关的菜单、页面、tab、popup surface。
- 统一 target family 名称：
  - `menu-group`
  - `menu-item`
  - `page`
  - `outer-tab`
  - `route-content`
  - `popup-page`
  - `popup-tab`
  - `popup-content`
  - `node`
- 其中菜单层只覆盖 `group` 与用于 Modern page(v2) 的 `flowPage` 菜单项；route-backed 家族是 `page` / `outer-tab` / `route-content`；popup 家族是 `popup-page` / `popup-tab` / `popup-content`。
- 不扩展成通用桌面导航管理器；外链、移动端路由、工作台其它导航入口、权限配置不属于本 skill。

# Global Rules

- live MCP tool schema，以及现场 `get/catalog/readback`，优先于本地文档。
- references 里若出现 `Hard rule` / `Default heuristic` / `Fallback`，分别表示必须遵守 / 默认偏好 / 兜底路径。
- 菜单优先：用户表达“新建页面 / 页面入口 / 菜单下建页面”时，默认流程是先 `createMenu(type="item")`，再 `createPage(menuRouteId=...)`。
- `createPage` 不传 `menuRouteId` 只视为兼容 fallback；如果用户还要求放到某个菜单下，创建后必须补 `updateMenu(parentMenuRouteId=...)`。
- `createMenu(type="item")` 只创建可绑定菜单项与预置 route shell；真正把页面标记为已初始化、补齐首个 grid anchor，要靠 `createPage(menuRouteId=...)`。
- page/tab 生命周期 API 只对“已初始化页面”生效；在 `createPage(menuRouteId=...)` 之前，不要调用 `addTab`、`updateTab`、`moveTab`、`removeTab`、`destroyPage`。
- 如果用户只给菜单标题而没有 `routeId`，先用 `desktop_routes_list_accessible(tree=true)` 发现菜单树，只接受唯一命中的 `group` 作为 `parentMenuRouteId`。
- 菜单标题匹配到 0 个、多个，或命中的不是 `group`，都要停止猜测并向用户说明。
- 已有 target 上的写入默认走 `get -> catalog -> write -> readback`。
- 只有在当前执行链里刚由写接口直接返回的下一个 target uid，才允许跳过一次前置 `get`；但仍然必须先 `catalog`。
- `inspect` 是只读检查：默认只调用 `get`，必要时才 `catalog`；只有用户明确要求修复、创建、修改或重排时才进入写流程。
- 工具默认优先顺序是：菜单 / 页面 lifecycle API -> `compose` / `configure` / `add*` -> `updateSettings/setLayout/setEventFlows` -> `apply/mutate`。同一目标下优先选择最小公开语义入口：批量搭建优先 `compose`，高频改配优先 `configure`，精确追加优先 `add*`。
- 先看 `configureOptions`；公开配置表达不了时才看 `settingsContract`。
- 如果现场 `get/catalog` 没有明确暴露目标能力、target 绑定字段、resource binding 或 settings contract，停止猜测并向用户说明，不要按文档臆造写入。
- 如果 target 只能靠同一 `parent/subKey` 下多个相同 `use/type` sibling 的相对位置来猜，先停止并收敛唯一 target。

# Reference Guide

- 需要确认 target family、读 locator、写 target uid 时，看 [references/runtime-playbook.md](./references/runtime-playbook.md)。
- 需要确认 payload 形状时，看 [references/tool-shapes.md](./references/tool-shapes.md)。
- 需要 popup / openView / linkageRules / event flow 规则时，看 [references/popup-and-event-flow.md](./references/popup-and-event-flow.md)。
- 需要 record popup 示例流程时，看 [references/record-popup-recipes.md](./references/record-popup-recipes.md)。
- 需要 block / form / action / field / JS 选型时，看 [references/blocks.md](./references/blocks.md)、[references/forms.md](./references/forms.md)、[references/actions.md](./references/actions.md)、[references/fields.md](./references/fields.md)、[references/js.md](./references/js.md)。
- 需要把用户自然语言映射成 UI 术语时，看 [references/aliases.md](./references/aliases.md)。
- 需要写后断言时，看 [references/readback.md](./references/readback.md)。

# Verification Checklist

- 写入后只核对本次变更直接相关的 target；完整细则统一看 [references/readback.md](./references/readback.md)。
- 菜单写入时，优先核对 `routeId/type/parentMenuRouteId`；一旦发生移动、挂接或标题发现链路，升级为菜单树读回。
- 生命周期或 route/tree 层级变化时，升级为完整 route/tree 校验。
- record popup 场景下，确认 popup 不只是空 shell；如果现场读回暴露了记录绑定语义，再核对其已落到“当前记录”。
- 结构、字段、配置断言都以对应 reference 和现场读回为准。
- RunJS 场景下，除了 UI 结构读回，还要核对最终落盘 `code` 与通过 gate 的 code 完全一致。
- `inspect` 只做只读检查，不进入写后验证流程。
