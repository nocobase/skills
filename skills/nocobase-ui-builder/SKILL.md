---
name: nocobase-ui-builder
description: 当用户要通过 NocoBase MCP 从自然语言搭建、修改、重排或静态校验 Modern page (v2) 的 page/tab/popup UI surface 时使用；覆盖 route-backed page/tab、popup child tab，以及 page/tab/popup 内的 block/field/action/layout/configuration；不负责浏览器 validation case 复现或页面报错复盘。
---

# 目标

稳定完成 Modern page(v2) 的 UI surface 搭建、修改与只读校验；涉及写入时，在写后通过运行时读回确认结果。

# 前置条件

- NocoBase MCP 必须可达且已认证。
- 如果 MCP 返回认证错误，不要尝试自行登录；让用户先修复 NocoBase MCP 认证，再继续。

# 开始前先判别

先锁定这 3 件事，再决定读哪份文档和调用哪类接口：

1. **变更类型**：新建 / 修改 / 只读校验
2. **目标层级**：route-backed page / outer tab / popup child tab / 普通节点
3. **操作类别**：生命周期操作 / 结构搭建 / 配置改动 / 复杂编排

# 按任务类型读哪份

- 生命周期操作：看 [references/runtime-playbook.md](./references/runtime-playbook.md) + [references/tool-shapes.md](./references/tool-shapes.md)
- 只读校验：看 [references/runtime-playbook.md](./references/runtime-playbook.md) + [references/readback.md](./references/readback.md)
- popup / openView / event flow：看 [references/popup-and-event-flow.md](./references/popup-and-event-flow.md)
- block 选型：看 [references/blocks.md](./references/blocks.md) 或 [references/forms.md](./references/forms.md)
- action / field / JS 能力：看 [references/actions.md](./references/actions.md)、[references/fields.md](./references/fields.md)、[references/js.md](./references/js.md)
- 默认创建策略与保守边界：看 [references/capability-policy.md](./references/capability-policy.md) + [references/boundaries.md](./references/boundaries.md)
- 用户自然语言映射：看 [references/aliases.md](./references/aliases.md)

如果文档与现场 `get/catalog` 读回不一致，以现场读回为准。

# 术语速记

- **page**：route-backed 顶层页面
- **outer tab**：页面下的 route-backed tab
- **popup page**：宿主 action/field 打开的弹窗容器
- **popup child tab**：popup 内部 tab
- **locator**：给 `get` 用的根级定位字段
- **target.uid**：给大多数写接口用的目标节点 uid
- **readback**：写后只核对本次变更直接相关结构或配置，不默认做全量校验

# Hard Guardrails

- 已有 target 上写入默认 `get -> catalog -> write -> 最小必要读回`。
- 只有**当前回合**里刚由 `createPage`、`addTab`、`addPopupTab` 或 popup-capable 宿主写接口返回的 uid，才算“新 target”，可以跳过一次前置 `get`；但仍要先 `catalog`。
- route-backed tab 和 popup child tab 必须走两套 lifecycle API；不能因为都读回成 `kind = "tab"` 就混用。
- `flow_surfaces_get` 只接受 `uid`、`pageSchemaUid`、`tabSchemaUid`、`routeId` 这 4 个根级 locator；不要包 `requestBody` 或 `target`。
- 只读校验请求默认不写入；只有用户明确要求修复、创建或修改时才进入写流程。
- 优先 `compose/configure`；公开配置不够时再看 `settingsContract`，再决定是否用 `updateSettings` / `setLayout` / `setEventFlows` / `apply` / `mutate`。
- 新页面在 `createPage` 之前没有现成 target，不要先猜一个 page/tab/grid 去调 `catalog`。
- 如果现场 `get/catalog` 没有明确暴露目标能力、target 绑定字段或 settings contract，停止猜测并向用户说明，不要按文档臆造写入。
