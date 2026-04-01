---
name: nocobase-ui-builder
description: 当用户要通过 NocoBase MCP 从自然语言搭建、修改、重排或静态校验 Modern page (v2) 的 route-backed page / tab / popup UI surface 时使用；覆盖 page、outer tab、popup page、popup child tab，以及内容区内的 block/field/action/layout/configuration；不负责浏览器 validation case 复现或页面报错复盘。
argument-hint: "[task: build|update|reorder|review] [target: page|tab|popup|block|field|action|layout|config]"
allowed-tools: All MCP tools provided by NocoBase server
---

# Goal

稳定完成 Modern page(v2) 的 UI surface 搭建、修改与只读校验；涉及写入时，在写后通过运行时读回确认结果。

# Dependency Gate

- NocoBase MCP 必须可达且已认证。
- 如果 MCP 返回认证错误，不要尝试自行登录；让用户先修复 NocoBase MCP 认证，再继续。
- 如果本次目标依赖尚不存在的 collection、relation、selector 资源，先转给 `nocobase-data-modeling`，完成后再继续 UI surface 搭建。
- 如果本次目标依赖尚未配置好的 workflow action / trigger / execution path，先转给 `nocobase-workflow-manage`，完成后再继续 UI surface 搭建。
- 如果用户要做浏览器 validation case 复现、页面报错复盘或运行时 UI 验证，这不属于本 skill 范围。

# Scope

- 只处理 route-backed Modern page(v2) surface。
- 覆盖的运行时目标家族固定为：
  - `page`
  - `outer tab`
  - `route-backed content`
  - `popup page`
  - `popup child tab`
  - `popup content`
  - `generic node`
- 不负责桌面路由、页面菜单、工作台导航这类 page 外层概念；只有它们已经作为 Modern page(v2) 内部节点暴露出来时，才继续处理。

# Default Skeleton

开始执行前，先固定这 4 个判断：

1. **变更类型**：`build` / `update` / `review`
2. **目标家族**：看 [references/runtime-playbook.md](./references/runtime-playbook.md)
3. **请求形状**：只看 [references/tool-shapes.md](./references/tool-shapes.md)
4. **写后验证**：只看 [references/readback.md](./references/readback.md)

常用 topical refs：

- popup / openView / event flow：看 [references/popup-and-event-flow.md](./references/popup-and-event-flow.md)
- block 选型：看 [references/blocks.md](./references/blocks.md) 或 [references/forms.md](./references/forms.md)
- action / field / JS 能力：看 [references/actions.md](./references/actions.md)、[references/fields.md](./references/fields.md)、[references/js.md](./references/js.md)
- 默认创建策略与保守边界：看 [references/capability-policy.md](./references/capability-policy.md) + [references/boundaries.md](./references/boundaries.md)
- 用户自然语言映射：看 [references/aliases.md](./references/aliases.md)

# Global Rules

- 如果文档与现场 `get/catalog/readback` 不一致，以现场读回为准。
- 已有 target 上的写入默认走 `get -> catalog -> write -> readback`。
- 只有在**当前执行链**里刚由写接口直接返回的下一个 target uid，才允许跳过一次前置 `get`；但仍然必须先 `catalog`。
- `request shape` 的唯一 owner 是 [references/tool-shapes.md](./references/tool-shapes.md)；不要在其他文档里自行拼 envelope。
- `readback` 的唯一 owner 是 [references/readback.md](./references/readback.md)；不要在其他文档里自行扩写操作到读回的映射。
- 工具升级顺序固定为：lifecycle API -> `compose/add*` -> `configure` -> `updateSettings/setLayout/setEventFlows` -> `apply/mutate`。
- 只读校验默认不写入；只有用户明确要求修复、创建或修改时才进入写流程。
- 新页面在 `createPage` 之前没有现成 target，不要先猜一个 page/tab/grid 去调 `catalog`。
- 如果现场 `get/catalog` 没有明确暴露目标能力、target 绑定字段或 settings contract，停止猜测并向用户说明，不要按文档臆造写入。
