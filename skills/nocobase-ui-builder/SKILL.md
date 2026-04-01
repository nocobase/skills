---
name: nocobase-ui-builder
description: 当用户要通过 NocoBase MCP 从自然语言创建、修改、重排或校验 Modern page (v2) 的 page/tab/popup UI surface 时使用；覆盖 route-backed page/tab、popup child tab，以及 page/tab/popup 内的 block/field/action/layout/configuration，必要时可配合其他 NocoBase MCP tools 收集上下文或交叉校验。
---

# 目标

稳定完成 Modern page(v2) 的 UI surface 搭建、修改与只读校验；涉及写入时，在写后通过运行时读回确认结果。

# Prerequisite

- NocoBase MCP 必须可达且已认证。
- 如果 MCP 返回认证错误，不要尝试自行登录；让用户先修复 NocoBase MCP 认证，再继续。

# Runtime Truth

- 完整索引看 [references/README.md](./references/README.md)。
- 运行时单一真相源看 [references/runtime-truth/overview.md](./references/runtime-truth/overview.md)。
- 请求形状统一看 [references/runtime-truth/tool-shapes.md](./references/runtime-truth/tool-shapes.md)。
- `maintenance/`、`observability/`、`test-cases/` 只用于维护与验证，不作为运行时入口。
- 如果文档、示例和现场 `get/catalog` 读回不一致，以现场读回为准。

# Task Entry

- 新建完整页面：先 `createPage`，后续默认流程统一看 `overview.md` 的“新建完整页面”。
- 已有 page 新增外层 tab：先 `get` 拿 `pageUid`，再 `addTab`；不要误用 `createPage`。
- 已有页面增量修改：先 `get`，再 `catalog`，后续按 `configure` 或精确编辑分流。
- 已有 popup subtree 写入：先 `get(hostUid / popupPageUid)` 或复用刚返回的 popup uid，区分 `popupPageUid`、`popupTabUid/tabUid`、`popupGridUid` 这次要写哪一层，再 `catalog(target=对应 popup target)`，后续按 `compose/configure/add*` 分流。
- 新增 popup child tab：先 `addPopupTab(target.uid=popupPageUid)`；如果要继续写它的内容，先对返回的 `tabUid/gridUid` 做 `catalog`，再继续。
- 只读校验 / review：先 `get`，必要时 `catalog`，按 [references/contracts/readback-checklist.md](./references/contracts/readback-checklist.md) 选择最小必要读回；无明确写入意图时不要调用写接口。
- 精确编辑、事件流、布局、编排：先 `get -> catalog`；公开配置不够时才看 `updateSettings`，事件流仍然要在 popup / openView settings 落盘后再写。

# Guardrails

- 运行时细则以 `overview.md` 为准；这里不再重复定义第二套默认流程或 uid 真相。
- 已有 target 上写入默认 `get -> catalog -> write -> 最小必要读回`；只有刚创建出来的新 target 才能跳过前置 `get`，但仍要先 `catalog`。
- route-backed tab 和 popup child tab 必须走两套 lifecycle API；不能因为都读回成 `kind = "tab"` 就混用。
- 只读校验请求默认不写入；只有用户明确要求修复、创建或修改时才进入写流程。

# 高频 References

- 完整索引：[references/README.md](./references/README.md)
- 运行时总览：[references/runtime-truth/overview.md](./references/runtime-truth/overview.md)
- 请求形状：[references/runtime-truth/tool-shapes.md](./references/runtime-truth/tool-shapes.md)
- 读取与发现：[references/tools/read-and-discovery.md](./references/tools/read-and-discovery.md)
- page/tab 生命周期：[references/tools/page-and-tab-lifecycle.md](./references/tools/page-and-tab-lifecycle.md)
- 语义化搭建：[references/tools/semantic-building.md](./references/tools/semantic-building.md)
- 精确编辑：[references/tools/precise-edits.md](./references/tools/precise-edits.md)
- popup / openView：[references/advanced/popup-and-openview.md](./references/advanced/popup-and-openview.md)
- 高级边界与复杂场景：[references/advanced/README.md](./references/advanced/README.md)
- 只读校验与读回：[references/contracts/README.md](./references/contracts/README.md)
