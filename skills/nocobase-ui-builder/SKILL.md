---
name: nocobase-ui-builder
description: 当用户要通过 NocoBase MCP 从自然语言创建、修改、重排或校验 Modern page (v2) 的 page/tab/popup UI surface 时使用；覆盖 route-backed page/tab、popup child tab，以及 page/tab/popup 内的 block/field/action/layout/configuration，必要时可配合其他 NocoBase MCP tools 收集上下文或交叉校验。
---

# 目标

稳定完成 Modern page(v2) 的 UI surface 搭建、修改与只读校验；涉及写入时，在写后通过运行时读回确认结果。

# 前置条件

- NocoBase MCP 必须可达且已认证。
- 如果 MCP 返回认证错误，不要尝试自行登录；让用户先修复 NocoBase MCP 认证，再继续。

# Canonical Docs

- 完整索引看 [references/README.md](./references/README.md)。
- 运行时单一真相源看 [references/runtime-truth/overview.md](./references/runtime-truth/overview.md)。
- 请求形状统一看 [references/runtime-truth/tool-shapes.md](./references/runtime-truth/tool-shapes.md)。
- 能力策略统一看 [references/runtime-truth/capability-matrix.md](./references/runtime-truth/capability-matrix.md)。
- 读回与验收统一看 [references/contracts/readback-checklist.md](./references/contracts/readback-checklist.md)。
- 如果文档与现场 `get/catalog` 读回不一致，以现场读回为准。

# Hard Guardrails

- 已有 target 上写入默认 `get -> catalog -> write -> 最小必要读回`；只有刚创建出来的新 target 才能跳过前置 `get`，但仍要先 `catalog`。
- route-backed tab 和 popup child tab 必须走两套 lifecycle API；不能因为都读回成 `kind = "tab"` 就混用。
- 只读校验请求默认不写入；只有用户明确要求修复、创建或修改时才进入写流程。
- 优先 `compose/configure`，再用精确编辑；优先 `configureOptions`，公开配置不够时才看 `settingsContract` / `updateSettings`。
- 新页面在 `createPage` 之前没有现成 target，不要先猜一个 page/tab/grid 去调 `catalog`。
