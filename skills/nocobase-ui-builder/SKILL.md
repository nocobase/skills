---
name: nocobase-ui-builder
description: 当用户要通过 NocoBase MCP 从自然语言搭建、修改、重排或只读检查 Modern page (v2) UI surface 时使用；覆盖 route-backed `page` / `outer-tab` / `route-content`、popup subtree，以及内容区内的 block/field/action/layout/configuration；不负责浏览器 validation case 复现或页面报错复盘。
argument-hint: "[task: build|update|reorder|inspect] [target: page|outer-tab|route-content|popup-page|popup-tab|popup-content|node]"
allowed-tools: All MCP tools provided by NocoBase server
---

# Goal

稳定完成 Modern page(v2) 的 UI surface 搭建、修改、重排与只读检查；涉及写入时，在写后通过运行时读回确认结果。

# Dependency Gate

- NocoBase MCP 必须可达且已认证。
- 如果 MCP 返回认证错误，不要尝试自行登录；让用户先修复 NocoBase MCP 认证，再继续。
- 如果本次目标依赖尚不存在的 collection、relation、selector 资源，先转给 `nocobase-data-modeling`，完成后再继续 UI surface 搭建。
- 如果本次目标依赖尚未配置好的 workflow action / trigger / execution path，先转给 `nocobase-workflow-manage`，完成后再继续 UI surface 搭建。
- 如果用户要做浏览器 validation case 复现、页面报错复盘或运行时 UI 验证，这不属于本 skill 范围。

# Mandatory MCP Gate

- 写入前，先确认 `flow_surfaces_get` 与本次要用到的 `flow_surfaces_*` 写接口已暴露。
- 如果当前 MCP 只暴露部分读接口或部分写接口，按现场能力收窄；缺少关键接口时，停止并说明 MCP 能力不足。
- 不要因为文档存在就假设接口一定可用。

# Scope

- 只处理 Modern page(v2) surface。
- 统一 target family 名称：
  - `page`
  - `outer-tab`
  - `route-content`
  - `popup-page`
  - `popup-tab`
  - `popup-content`
  - `node`
- 其中 route-backed 家族是 `page` / `outer-tab` / `route-content`；popup 家族是 `popup-page` / `popup-tab` / `popup-content`。
- 不单独操作桌面路由、页面菜单、工作台导航这类 page 外层资源；只有它们已经作为 Modern page(v2) surface 的内部节点暴露出来时，才继续处理。

# Default Skeleton

开始执行前，先固定这 4 个判断：

1. **变更类型**：`build` / `update` / `reorder` / `inspect`
2. **目标家族**：只用本文件里的统一 target family 名称；具体 uid / locator 看 [references/runtime-playbook.md](./references/runtime-playbook.md)
3. **请求形状**：只看 [references/tool-shapes.md](./references/tool-shapes.md)
4. **写后验证**：只看 [references/readback.md](./references/readback.md)

常用 topical refs：

- popup / openView / event flow：看 [references/popup-and-event-flow.md](./references/popup-and-event-flow.md)
- block 选型：看 [references/blocks.md](./references/blocks.md) 或 [references/forms.md](./references/forms.md)
- action / field / JS 能力：看 [references/actions.md](./references/actions.md)、[references/fields.md](./references/fields.md)、[references/js.md](./references/js.md)
- 用户自然语言映射：看 [references/aliases.md](./references/aliases.md)

# Global Rules

- 本节规则默认都是横切 `Hard rule`。
- 如果文档与现场 `get/catalog/readback` 不一致，以现场读回为准。
- 规则优先级固定为：现场 `get/catalog/readback` -> 本节 `Global Rules` -> 对应 owner 文档 -> `Default heuristic` / `Fallback`。
- 本节负责横切规则；owner 文档负责各自专题下的 `Hard rule` / `Default heuristic` / `Fallback`。
- 所有 references 里的 `Hard rule` / `Default heuristic` / `Fallback` 术语含义统一：必须遵守 / 默认偏好 / 兜底路径。
- **当前执行链** 指单次 assistant 执行这套 skill 的连续操作链，不跨后续用户回合复用 shortcut。
- 已有 target 上的写入默认走 `get -> catalog -> write -> readback`。
- 只有在**当前执行链**里刚由写接口直接返回的下一个 target uid，才允许跳过一次前置 `get`；但仍然必须先 `catalog`。
- `request shape` 的唯一 owner 是 [references/tool-shapes.md](./references/tool-shapes.md)；不要在其他文档里自行拼 envelope。
- `readback` 的唯一 owner 是 [references/readback.md](./references/readback.md)；不要在其他文档里自行扩写操作到读回的映射。
- 工具默认优先顺序是：lifecycle API -> `compose` / `configure` / `add*` -> `updateSettings/setLayout/setEventFlows` -> `apply/mutate`。同一目标下优先选择最小公开语义入口：批量搭建优先 `compose`，高频改配优先 `configure`，精确追加优先 `add*`。
- `inspect` 是只读检查：默认只调用 `get`，必要时才 `catalog`；只有用户明确要求修复、创建、修改或重排时才进入写流程。
- 新页面在 `createPage` 之前没有现成 target，不要先猜一个 page/tab/grid 去调 `catalog`。
- 先看 `configureOptions`；公开配置表达不了时才看 `settingsContract`。
- 如果现场 `get/catalog` 没有明确暴露目标能力、target 绑定字段或 settings contract，停止猜测并向用户说明，不要按文档臆造写入。
- 如果 target 只能靠同一 `parent/subKey` 下多个相同 `use/type` sibling 的相对位置来猜，先停止并收敛唯一 target。

# Verification Checklist

- 写入后只核对本次变更直接相关的 target；完整细则统一看 [references/readback.md](./references/readback.md)。
- 生命周期或 route/tree 层级变化时，升级为完整 route/tree 校验。
- 结构、字段、配置断言都以对应 owner 文档和现场读回为准。
- `inspect` 只做只读检查，不进入写后验证流程。
