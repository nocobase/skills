---
name: nocobase-ui-builder
description: 当用户要通过 NocoBase MCP 检查、搭建、修改或重排 Modern page (v2) 的菜单、页面、页签、弹窗，以及区块/字段/动作时使用；默认走 FlowSurfaces；不负责浏览器复现、页面报错复盘、ACL、数据建模与工作流细节。
argument-hint: "[task: inspect|create-page|move-menu|compose|reorder|popup|runjs]"
allowed-tools: Bash, Read, All MCP tools provided by NocoBase server
---

# Goal

稳定完成 Modern page (v2) 的 inspect / build / update / reorder。涉及写入时，默认做最小必要 `readback`。

## Scope & Terms

- 只处理与 Modern page (v2) 直接相关的菜单、页面、tab、popup surface，以及内容区里的 block / field / action / layout / configuration。
- 不负责浏览器 validation case 复现、页面报错复盘、通用桌面导航管理、权限配置、数据建模与 workflow 细节。
- 依赖缺失时转交：collection / relation / selector 给 `nocobase-data-modeling`；workflow action / trigger / execution path 给 `nocobase-workflow-manage`。
- `target family`：当前目标属于哪类 surface；统一用 `menu-group`、`menu-item`、`page`、`outer-tab`、`route-content`、`popup-page`、`popup-tab`、`popup-content`、`node`。
- `已初始化页面`：已经执行过 `createPage(menuRouteId=...)`，可以继续使用 page/tab lifecycle API 的页面。
- `readback`：写入后的最小必要读回，用来确认结构、路由、popup subtree 或配置是否真的落盘。

## Hard Rules & Stop Conditions

1. live MCP tool schema，以及现场 `get` / `catalog` / `readback`，优先于本地文档。
2. `inspect` 默认只读；只有用户明确要求创建、修改、重排或修复时才进入写流程。
3. UI structure mutation 只走 `flow_surfaces_*`；菜单树发现只走 `desktop_routes_list_accessible(tree=true)`。
4. 不要用 `resource_*` / generic CRUD / 底层 route 记录写入来替代 page、tab、popup、block、field、action 的 surface API。
5. 菜单标题不唯一不猜；只接受菜单树里唯一命中的 `group` 作为父菜单。
6. 已有 target 的写入默认走 `get -> catalog -> write -> readback`；只有刚由写接口直接返回的下一个 target uid，才允许跳过一次前置 `get`。
7. 如果现场 `get/catalog` 没有明确暴露目标能力、target 绑定字段、resource binding、settings contract 或 `currentRecord` guard，停止猜测，不要臆造写入。
8. 如果 target 只能靠同一 `parent/subKey` 下多个相同 `use/type` sibling 的相对位置来猜，先停止并收敛唯一 target。
9. page lifecycle 顺序不能乱：`createMenu(type="item")` 之后，先 `createPage(menuRouteId=...)` 初始化页面，再使用 page/tab lifecycle API。
10. NocoBase MCP 必须可达且已认证；如果缺少关键接口或返回认证错误，停止并说明 MCP 能力或认证不足。

## Task Router

| 任务 | 先读什么 | 主写入口 | 主 reference |
| --- | --- | --- | --- |
| `inspect` | 菜单标题场景先读菜单树；已初始化 surface 默认 `get`，必要时再 `catalog` | 无写入 | [verification.md](./references/verification.md) |
| `create-page` | 先发现或创建父菜单，再初始化页面 | `createMenu(type="item") -> createPage(menuRouteId=...)` | [runtime-playbook.md](./references/runtime-playbook.md) |
| `move-menu` | 已知 `menuRouteId` 直接移动；只给菜单标题时先读菜单树 | `updateMenu(parentMenuRouteId=...)` | [runtime-playbook.md](./references/runtime-playbook.md) |
| `compose` | `get -> catalog`；自然语言歧义时再看 aliases | `compose` / `configure` / `add*` | [capabilities.md](./references/capabilities.md) |
| `reorder` | 先 `get` 确认 sibling 与目标定位 | `moveTab` / `movePopupTab` / `moveNode` | [runtime-playbook.md](./references/runtime-playbook.md) |
| `popup` | 先明确是 action popup、record popup，还是 field `openView` | `addRecordAction` / `addAction` / `configure` / `setEventFlows` | [popup.md](./references/popup.md) |
| `runjs` | 先收敛容器与 JS model，再过 validator gate | 通常先 `configure`，必要时再 `add*` | [js.md](./references/js.md) |

## Read Order

### 默认先读

- [verification.md](./references/verification.md)：`inspect` 流程、写后 `readback`、断言升级条件。
- [runtime-playbook.md](./references/runtime-playbook.md)：target family、locator、write target 与默认写流程。
- 如果任务涉及 `chart` 区块写入，进入写流程前先读 [chart.md](./references/chart.md)，不要跳过。

### 按需再读

- [popup.md](./references/popup.md)：popup / `openView` / `currentRecord` guard / `flowRegistry` / record popup recipes。
- [capabilities.md](./references/capabilities.md)：block / form / action / field 的默认选型与 scope 规则。
- [chart.md](./references/chart.md)：chart block 的最小公开参数集（`title / displayTitle / height / heightMode / query / visual / events`）、合法参数、canonical readback、推荐执行顺序（`addBlock -> context(chart/collection) -> configure -> get`），以及 `flowSurfaces:context(path=\"chart\" | \"collection\")` 的用法。
- [js.md](./references/js.md)：RunJS validator gate、model mapping、上下文语义与代码风格。
- [tool-shapes.md](./references/tool-shapes.md)：flow surfaces 请求 envelope、`requestBody` 形状与常见错误。
- [aliases.md](./references/aliases.md)：高歧义自然语言表达如何先收敛到对象语义或能力。
