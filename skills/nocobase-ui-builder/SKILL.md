---
name: nocobase-ui-builder
description: 通过 NocoBase MCP 的 flowSurfaces tools 语义化搭建 Modern page (v2) 的页面菜单、tab、区块、字段、操作、布局与高级配置；适用于从自然语言构建完整页面，或对既有页面做读取、修改、移动、删除。
allowed-tools: All MCP tools provided by NocoBase server, plus local Node for scripts/*.mjs under this skill
---

# 目标

使用 NocoBase MCP 暴露的 `flowSurfaces` tools，稳定地完成以下事情：

- 创建 route-backed 的 Modern page(v2) 页面与默认 tab。
- 搭建页面菜单可见的页面入口，以及 tab 内的区块、字段、操作、布局。
- 对已有页面做读取、增量修改、排序、删除、popup 搭建、事件流配置、联动规则配置。
- 在每次写入前后通过 `catalog/get` 做约束确认与读回校验，保证生成准确、可修复、可观测。

# 适用范围

本 skill 只覆盖 `flowSurfaces` 公开能力对应的 UI 搭建子集：

- 页面与菜单：`flowPage` 页面路由、默认 tab 路由、同页 tab 的增删改移。
- 区块：collection blocks、static blocks、JS block、action panel。
- 字段：绑定字段、关系叶子字段、`renderer: "js"`、`jsColumn`、`jsItem`。
- 操作：collection action、record action、form action、filter-form action、action-panel action。
- 布局与配置：`compose`、`configure`、`updateSettings`、`setLayout`、`setEventFlows`、`apply`、`mutate`。

不属于本 skill 运行时范围的事情：

- 不直接使用 REST API。
- 不在运行时引导模型去查看 `~/auto_works/nocobase` 源码或飞书文档。
- 不负责数据建模、ACL、工作流整体设计本身；这里只负责 UI surface 的搭建与 UI 事件绑定。
- 不把 raw tree patch 当默认方案；只有在公开 contract 已明确时才用精确直写接口。
- 不把“页面菜单”扩展解释成通用菜单系统；这里只处理 route-backed Modern page 页面入口。

# 运行时真相

运行时只应依赖两类信息：

1. 当前 skill 内置文档。
2. 当前应用通过 `catalog/get` 读回得到的实时能力与状态。

维护 skill 时可以参考源码和设计文档，但这些都不是运行时依赖。运行时如果文档与现场不一致，以 `catalog/get` 为准。

先读这些文档：

- 运行时真相总览：[references/runtime-truth/overview.md](./references/runtime-truth/overview.md)
- 能力矩阵：[references/runtime-truth/capability-matrix.md](./references/runtime-truth/capability-matrix.md)
- MCP tool 形状：[references/runtime-truth/tool-shapes.md](./references/runtime-truth/tool-shapes.md)
- 事务与批量语义：[references/runtime-truth/transaction-semantics.md](./references/runtime-truth/transaction-semantics.md)
- 页面/菜单边界：[references/runtime-truth/page-scope.md](./references/runtime-truth/page-scope.md)

# 硬规则

- `flowSurfaces:get` 对应的 MCP tool 是 `mcp__nocobase__GetFlowsurfaces_get`，它只接受根级定位字段：`uid`、`pageSchemaUid`、`tabSchemaUid`、`routeId`。不要写成 `target` 包装。
- 任何精确写入前，先做一次 `catalog`，确认当前 target 下允许创建什么 block/field/action，以及 settings contract 是什么。
- 任何修复、重排、删除、多步改造前，先做一次 `get`，拿到当前树、`nodeMap`、route/tab 读回。
- 优先使用 `createPage -> compose -> configure`。只有当公开语义不够时，才降级到 `add* / updateSettings / setEventFlows / setLayout / apply / mutate`。
- `addAction` 只用于非 record action；`addRecordAction` 只用于 record action。`table/details/list/gridCard` 的记录级操作不要混进 `addAction`。
- `catalog(target=table/details/list/gridCard)` 返回的 `actions` 是 block 级操作，`recordActions` 是记录级操作；语义拆分必须保持一致。
- `linkageRules` 与 `flowRegistry` 不是一回事。前者是 stepParams 内的联动配置，后者是实例级事件流定义。
- `setEventFlows` 只能绑定当前节点 contract 允许的事件和 step；若清空了对应设置，再绑定原事件流会失败。
- `apply` 在 v1 只允许 `mode="replace"`；`mutate` 在 v1 只允许 `atomic=true`。
- 如果批量工具 `addBlocks/addFields/addActions/addRecordActions` 在当前会话尚未出现，退化为顺序调用等价的单项工具，但保持相同的 target、顺序和读回校验。
- 写入后必须再次 `get`，确认 route、tree、nodeMap、popup uid、tab route 与配置都已落盘。

# 默认流程

1. 明确目标是“新建页面”还是“修改已有页面”。
2. 如果是改已有页面，先调用 `mcp__nocobase__GetFlowsurfaces_get` 读取现状。
3. 对当前 target 调用 `mcp__nocobase__PostFlowsurfaces_catalog`，读取 block/field/action 能力和 settings contract。
4. 新页面优先调用 `mcp__nocobase__PostFlowsurfaces_createpage`，再以返回的 `tabSchemaUid` 或 `gridUid` 作为后续入口。
5. 优先用 `mcp__nocobase__PostFlowsurfaces_compose` 一次组织主要区块、字段、操作和基础布局。
6. 高频配置优先用 `mcp__nocobase__PostFlowsurfaces_configure`，只在需要精确 path-level 直写时才用 `updateSettings`。
7. 对 popup、事件流、布局或复杂多步替换，使用对应的 `setEventFlows`、`setLayout`、`apply`、`mutate`。
8. 最后再次 `get`，并用 [references/contracts/readback-checklist.md](./references/contracts/readback-checklist.md) 做读回核对。

# 文档索引

按这个顺序加载：

- 页面与菜单：[references/navigation/page-and-menu.md](./references/navigation/page-and-menu.md)
- 区块目录：[references/capabilities/blocks/README.md](./references/capabilities/blocks/README.md)
- 字段目录：[references/capabilities/fields/README.md](./references/capabilities/fields/README.md)
- collection 操作目录：[references/capabilities/actions/collection/README.md](./references/capabilities/actions/collection/README.md)
- record 操作目录：[references/capabilities/actions/record/README.md](./references/capabilities/actions/record/README.md)
- form/filter-form 操作目录：[references/capabilities/actions/form/README.md](./references/capabilities/actions/form/README.md)
- tool 目录：[references/tools/README.md](./references/tools/README.md)
- 高级配置与边界：[references/advanced/boundaries.md](./references/advanced/boundaries.md)
- contract playbook：[references/advanced/contract-playbook.md](./references/advanced/contract-playbook.md)
- popup/openView：[references/advanced/popup-and-openview.md](./references/advanced/popup-and-openview.md)
- 联动与事件流：[references/advanced/linkage-and-event-flows.md](./references/advanced/linkage-and-event-flows.md)
- JS 能力：[references/advanced/js-models.md](./references/advanced/js-models.md)
- 别名词典：[references/lexicon/aliases.md](./references/lexicon/aliases.md)
- 读回与 contract checklist：[references/contracts/readback-checklist.md](./references/contracts/readback-checklist.md)

# 失败处理

- 如果 MCP 返回认证错误，不要尝试自行登录；让用户先修复 NocoBase MCP 认证，再继续。
- 如果 `catalog` 与预期能力不一致，以现场 `catalog` 为准，不要强行套用旧经验。
- 如果 `configure` 能做的事情已经覆盖需求，不要过早降级到 `updateSettings`。
- 如果某个配置 path 不确定，先查当前节点 `catalog.settingsContract`，再决定是否写入。
- 如果读回显示 popup uid、tab route 或 flowRegistry 没有同步，优先检查 target 是否错层，以及是否违反了 contract。
