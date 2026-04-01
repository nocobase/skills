---
name: nocobase-ui-builder
description: 当用户要通过 NocoBase MCP 从自然语言创建、修改、重排或校验 Modern page (v2) 的 page/tab/popup UI surface 时使用；覆盖 route-backed page/tab、popup child tab，以及 page/tab/popup 内的 block/field/action/layout/configuration，必要时可配合其他 NocoBase MCP tools 收集上下文或交叉校验。
---

# 目标

稳定完成以下 UI surface 搭建任务：

- 创建 route-backed 的 Modern page(v2) 页面、默认 tab 与菜单入口。
- 创建、修改、排序、删除 route-backed tab 与 popup child tab。
- 搭建 page / tab / popup 内的 block、field、action、layout 与高频配置。
- 对已有页面做读取、增量修改、popup 搭建、事件流配置、联动规则配置。
- 在写入前后通过运行时读回确认 contract 与结果，保证结果准确、可修复、可观测。

# Prerequisite

- NocoBase MCP 必须可达且已认证。
- 如果 MCP 返回认证错误，不要尝试自行登录；让用户先修复 NocoBase MCP 认证，再继续。

# Runtime Truth

运行时关于 UI surface 的规则入口优先看以下文档：

- [references/runtime-truth/overview.md](./references/runtime-truth/overview.md)
- [references/runtime-truth/tool-shapes.md](./references/runtime-truth/tool-shapes.md)
- [references/tools/README.md](./references/tools/README.md)

为完成 UI 搭建任务，可以按需调用其他 NocoBase MCP tools 获取上下文或做交叉校验；但页面 / tab / popup 的写入规则、tool shape 与读回判断，仍以上述文档和现场 `get/catalog` 为准。

`maintenance/`、`observability/`、`test-cases/` 只用于本地维护与验证，不作为运行时入口。

如果文档与现场 `get/catalog` 读回不一致，以现场读回为准。

# 执行优先级

- 新页面或外层 route-backed tab 优先 `createPage -> catalog -> compose -> configure -> get`。
- 已有页面优先 `get -> catalog -> configure -> get`。
- popup / openView / popup child tab 优先“先拿到 popup 相关 uid，再在 popup page/tab/grid 上继续写入”。
- 只有公开语义不够时才降级到 `add* / updateSettings / setEventFlows / setLayout / apply / mutate`。

# 核心约束

- 任何精确写入前先 `catalog`；任何修复、重排、删除、多步改造前先 `get`。
- route-backed tab 与 popup child tab 是两套 API：
  - 外层 page/tab 用 `addTab / updateTab / moveTab / removeTab`
  - popup 内 tab 用 `addPopupTab / updatePopupTab / movePopupTab / removePopupTab`
- `createPage` 返回 `pageUid / tabSchemaUid / gridUid`；外层 tab 的 canonical uid 直接用 `tabSchemaUid`。
- popup-capable action / field / block 可能返回 `popupPageUid / popupTabUid / popupGridUid`；`addPopupTab` 返回 `popupPageUid / tabUid / gridUid`。
- `addAction` 只用于非 record action；`addRecordAction` 只用于记录级动作。`details` 的公开动作语义也属于 `recordActions`。
- `form` 只在用户明确要求通用表单、或读回中已存在 `FormBlockModel` 时使用；默认优先 `createForm` / `editForm`。
- `map/comments` 不提供默认 happy-path 示例；是否可创建、如何改配，以现场 `catalog/get` 为准。
- `filterForm` 多目标场景下，只使用当前 contract 明确暴露的 target 绑定字段，优先 `defaultTargetUid`。
- `dataScope` 使用 FilterGroup 结构；空筛选可用 `null` 或 `{}`，不要直接传 query object。
- `configure` 只写公开 `configureOptions`；path 级精确写入前先看 `settingsContract`，不要猜 `stepParams` path。
- 写入后按变更类型做最小必要读回；页面 / tab / popup child tab 生命周期变更再做完整 route/tree 校验。

# 文档索引

必读：

- 运行时真相总览：[references/runtime-truth/overview.md](./references/runtime-truth/overview.md)
- MCP tool 形状：[references/runtime-truth/tool-shapes.md](./references/runtime-truth/tool-shapes.md)
- tool 目录：[references/tools/README.md](./references/tools/README.md)
- 高级配置与边界：[references/advanced/boundaries.md](./references/advanced/boundaries.md)

高频 leaf references：

- 读取与定位：[references/tools/read-and-discovery.md](./references/tools/read-and-discovery.md)
- page/tab 生命周期：[references/tools/page-and-tab-lifecycle.md](./references/tools/page-and-tab-lifecycle.md)
- 语义化搭建：[references/tools/semantic-building.md](./references/tools/semantic-building.md)
- 精确编辑：[references/tools/precise-edits.md](./references/tools/precise-edits.md)
- 编排：[references/tools/orchestration.md](./references/tools/orchestration.md)
- 绑定字段：[references/capabilities/fields/bound-field.md](./references/capabilities/fields/bound-field.md)
- 关系叶子字段：[references/capabilities/fields/relation-leaf.md](./references/capabilities/fields/relation-leaf.md)
- JS 字段能力：[references/capabilities/fields/js-models.md](./references/capabilities/fields/js-models.md)

按需：

- 能力矩阵：[references/runtime-truth/capability-matrix.md](./references/runtime-truth/capability-matrix.md)
- 事务与批量语义：[references/runtime-truth/transaction-semantics.md](./references/runtime-truth/transaction-semantics.md)
- 区块目录：[references/capabilities/blocks/README.md](./references/capabilities/blocks/README.md)
- 字段目录：[references/capabilities/fields/README.md](./references/capabilities/fields/README.md)
- collection 操作目录：[references/capabilities/actions/collection/README.md](./references/capabilities/actions/collection/README.md)
- record 操作目录：[references/capabilities/actions/record/README.md](./references/capabilities/actions/record/README.md)
- form/filter-form 操作目录：[references/capabilities/actions/form/README.md](./references/capabilities/actions/form/README.md)
- contract playbook：[references/advanced/contract-playbook.md](./references/advanced/contract-playbook.md)
- popup/openView：[references/advanced/popup-and-openview.md](./references/advanced/popup-and-openview.md)
- 联动与事件流：[references/advanced/linkage-and-event-flows.md](./references/advanced/linkage-and-event-flows.md)
- JS 能力：[references/advanced/js-models.md](./references/advanced/js-models.md)
- 别名词典：[references/lexicon/aliases.md](./references/lexicon/aliases.md)
- 读回与 contract checklist：[references/contracts/readback-checklist.md](./references/contracts/readback-checklist.md)

# 失败处理

- 如果 `catalog` 与预期能力不一致，以现场 `catalog` 为准，不要强行套用旧经验。
- 如果 `configure` 能做的事情已经覆盖需求，不要过早降级到 `updateSettings`。
- 如果某个配置 path 不确定，先查当前节点 `catalog.settingsContract`，再决定是否写入。
- 如果读回显示 popup uid、tab route 或 flowRegistry 没有同步，优先检查 target 是否错层，以及是否混用了 route-backed tab 与 popup child tab API。
- 如果 block 能力存在文档描述与现场能力冲突，按更保守的现场 contract 执行，并在结果里说明依据。
