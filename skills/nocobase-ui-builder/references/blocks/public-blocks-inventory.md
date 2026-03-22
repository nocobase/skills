---
title: 公共区块清单与结构盲点
description: 从 NocoBase 源码提取可通过 Add block 添加的 publicTreeRoots，并逐区块列出仅靠 schema-first 难以推断的结构细节与 skill 改进建议。
---

# 公共区块清单与结构盲点

本文件回答两个问题：

1. 源码里“Add block 可添加”的区块根（`BlockModel` / `CollectionBlockModel` / `DataBlockModel` 的子类）有哪些？
2. 对每个可添加区块，哪些结构细节如果只依赖当前 `nocobase-ui-builder` skill 与 schema-first 探测，仍然很容易猜错，必须结合源码或 manifest 才能稳定生成“UI Editor 里能创建出来”的 flow model 结构？

## 提取方式与清单

清单来源：读取 NocoBase 源码中的 flow schema manifests（而不是猜测 UI 菜单），提取 `publicTreeRoots`。

- 提取脚本：
  - `/Users/gchust/auto_works/nocobase-skills/skills/nocobase-ui-builder/scripts/source_inventory_catalog.mjs`
  - `collectNocobaseSourceInventory({ repoRoot: '/Users/gchust/auto_works/nocobase' }).publicTreeRoots`

当前从 `/Users/gchust/auto_works/nocobase` 提取到的 `publicTreeRoots` 共 15 个：

- `ActionPanelBlockModel`
- `ChartBlockModel`
- `CommentsBlockModel`
- `CreateFormModel`
- `DetailsBlockModel`
- `EditFormModel`
- `FilterFormBlockModel`
- `GridCardBlockModel`
- `IframeBlockModel`
- `JSBlockModel`
- `ListBlockModel`
- `MapBlockModel`
- `MarkdownBlockModel`
- `ReferenceBlockModel`
- `TableBlockModel`

下面逐区块列出：

- UI Add block 的默认骨架（以 `createModelOptions` 为准；没有时 UI 通常回退到 `{ use }`）。
- 仅靠 skill 很难可靠推断的结构点（stepParams 路径、默认子树、slot allowed uses、运行时分支语义）。
- 对 `nocobase-ui-builder` skill 的可落地改进建议（文档、payload guard、contracts/recipes）。

---

## ActionPanelBlockModel

**UI 默认骨架**

- `createModelOptions` 只有 `{ use: 'ActionPanelBlockModel' }`。
- 但服务端 manifest 的 skeleton/minimalExample 会带 `stepParams.actionPanelBlockSetting.{layout,ellipsis}` 与 `subModels.actions: []`，用于 schema/doc 展示。

证据：

- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-block-workbench/src/client/models/ActionPanelBlockModel.tsx`
- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-block-workbench/src/server/flow-schema-manifests/index.ts`

**难以只靠 skill 推断的结构点**

- `actions` 槽位允许的 uses 不是 Table/Details 那套 action（`AddNewActionModel` 等），而是：
  - `PopupActionModel` / `LinkActionModel` / `JSActionModel` / `ActionPanelScanActionModel`
  - 这个 allowed uses 集合来自 plugin 的 schema manifest，单靠 core skill 很容易把它当成“collection actions”。（风险：写错 use，UI Editor 里根本不会这样生成。）
- settings 的 stepParams 路径固定为：
  - `stepParams.actionPanelBlockSetting.layout.layout`（`grid|list`）
  - `stepParams.actionPanelBlockSetting.ellipsis.ellipsis`（boolean）

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/action-panel.md`，明确 action slot uses 与 stepParams 路径。
  - 在 `references/blocks/index.md` 把 `ActionPanelBlockModel` 纳入索引。
- Guard：
  - 在 `scripts/flow_payload_guard.mjs` 新增 `ActionPanelBlockModel.subModels.actions` 的 allowed uses 校验。
  - 缺少 `subModels.actions` 时可在 `canonicalize-payload` 自动补 `[]`（UI 允许空面板）。
- Recipes/contracts：
  - 在 `references/flow-model-recipes.md` 增加“当需求是快捷入口/工作台工具条时，schema uses 应包含 ActionPanelBlockModel”。

---

## ChartBlockModel

**UI 默认骨架**

- client 侧没有 `createModelOptions`，UI Add block 最小落库通常是 `{ use: 'ChartBlockModel' }`。

证据：

- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-data-visualization/src/client/flow/models/ChartBlockModel.tsx`

**难以只靠 skill 推断的结构点**

- 图表真正的可用配置不在 `resourceSettings`，而在 stepParams 的固定路径：
  - `stepParams.chartSettings.configure.query`（`mode: builder|sql`，以及 collectionPath/sqlDatasource/sql 等）
  - `stepParams.chartSettings.configure.chart.option`（`mode: basic|custom`，custom 时需要 `raw`）
  - `stepParams.chartSettings.configure.chart.events.raw`（事件脚本）
- 这些字段是 plugin manifest 里声明的动态 UI schema，并且显式标注“runtime 依赖”（collection metadata / query builder / SQL resource / chart builder / RunJS）。只靠 skill 很容易：
  - 误写成 `resourceSettings.init.collectionName` 的“列表查询”思路
  - 或者把 `chartSettings` 路径写错导致配置完全不生效

证据：

- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-data-visualization/src/server/flow-schema-manifests/index.ts`

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/chart.md`：写清 `chartSettings` 的路径、两个 mode（builder/sql，basic/custom）与“必须 schema-first”的理由。
- Guard：
  - 对 `ChartBlockModel`：
    - 若缺失 `stepParams.chartSettings.configure.query.mode` / `chart.option.mode`，在 general 模式给 warning，并在 canonicalize 里补 manifest skeleton（`builder` + `basic`）。
    - 不要把 chart 的 query 误 canonicalize 到 `resourceSettings`（保持隔离）。
- Recipes/contracts：
  - 当 build spec / validation 场景命中 “图表/报表/分析/sql” 关键词时，把 `ChartBlockModel` 加入 schema discovery uses。

---

## CommentsBlockModel

**UI 默认骨架**

`createModelOptions` 默认会创建 `subModels.items=[{ use: 'CommentItemModel' }]`。

证据：

- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-comments/src/client/models/CommentsBlockModel.tsx`

**难以只靠 skill 推断的结构点**

- `CommentsBlockModel` 只能用于 `collection.template === 'comment'` 的 collection（否则 runtime 会直接显示 warning）。单靠 schema-first 很难从 collection fields 推出 template 约束。
- `subModels.items` 是渲染评论列表的关键：`CommentList` 会 `model.mapSubModels('items')` 为每条评论渲染 item model。缺少 items 会导致“落库成功但页面空白”。

证据：

- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-comments/src/client/models/CommentList.tsx`
- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-comments/src/client/models/CommentsBlockModel.tsx`

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/comments.md`，写清 template 约束与默认 item 子树。
- Guard：
  - 若 `CommentsBlockModel` 缺 `subModels.items` 或 items 为空：
    - validation-case 模式：blocker（UI Add block 默认一定会有 CommentItemModel）。
    - general 模式：warning，并 canonicalize 自动补 `[{ use:'CommentItemModel' }]`。

---

## CreateFormModel

**UI 默认骨架**

`createModelOptions` 只创建 `subModels.grid.use='FormGridModel'`，不自动创建 submit action。

证据：

- `/Users/gchust/auto_works/nocobase/packages/core/client/src/flow/models/blocks/form/CreateFormModel.tsx`

**难以只靠 skill 推断的结构点**

- 很多“表单可用性”细节（字段 subModels.field、assign rules、关联上下文）必须依赖 schema-first + metadata，而不是只写 `fieldSettings.init`。
- “UI 默认骨架”与“可交付的最小可用”不同：UI 允许只落一个空表单壳，但交付场景通常需要显式 submit action。

**skill 改进建议**

- 文档：
  - 更新 `references/blocks/create-form.md`：拆分两套口径
    - UI Add block 默认骨架（只有 grid）
    - skill 的最小可用标准（submit action + 至少一个字段项）
- Guard：
  - 允许“空 actions”作为 warning（general），但 validation-case 仍可保持 blocker（按 skill 的真实可用性标准）。

---

## DetailsBlockModel

**UI 默认骨架**

- `createModelOptions` 会创建 `subModels.grid.use='DetailsGridModel'`。
- `DetailsBlockModel.subModels.actions` 是 record actions 槽位（通过 `RecordActionGroupModel` 添加）。
- `DetailsBlockModel.createResource` 的资源类型取决于 `resourceSettings.init` 是否“包含 filterByTk key”（不是 value 是否非空）：包含时是 `SingleRecordResource`，否则可能走 `MultiRecordResource(pageSize=1)` 并出现分页。

证据：

- `/Users/gchust/auto_works/nocobase/packages/core/client/src/flow/models/blocks/details/DetailsBlockModel.tsx`
- `/Users/gchust/auto_works/nocobase/packages/core/client/src/flow/models/base/CollectionBlockModel.tsx`（resourceSettings.init handler）

**难以只靠 skill 推断的结构点**

- `subModels.grid` 是硬必需；UI 不可能创建缺 grid 的 DetailsBlockModel，但如果仅靠模板 clone 很容易漏。
- details actions 新建时 UI 会强制写：
  - `stepParams.buttonSettings.general.type = "default"`（afterSubModelInit）
- “Associated records” 菜单项生成的 `resourceSettings.init` 里：
  - `associationName` 用的是 relation field 的 `resourceName`（不是 field.name）
  - `sourceId` 模板有特例：当 `field.sourceKey === field.collection.filterTargetKey` 时，UI 会用 `{{ctx.view.inputArgs.filterByTk}}`（否则用 `{{ctx.popup.record.<...>}}`）

证据：

- `/Users/gchust/auto_works/nocobase/packages/core/client/src/flow/models/base/CollectionBlockModel.tsx`（defineChildren）
- `/Users/gchust/auto_works/nocobase/packages/core/client/src/flow/models/blocks/details/DetailsBlockModel.tsx`（renderConfigureActions afterSubModelInit）

**skill 改进建议**

- 文档：
  - 更新 `references/blocks/details.md`：补 “UI 默认骨架速查”，明确 grid 必需、actions slot 路径、resourceSettings.init 的 key 语义与默认模板。
  - 更新 `references/patterns/record-actions.md`：补 details actions 默认 button type 写入。
- Guard：
  - 新增 `DetailsBlockModel` 的 grid 必需校验（validation-case 下 blocker）。
  - 对 `DetailsBlockModel.subModels.actions` 保持 record action allowed uses 校验（已有），并可选补 “buttonSettings.general.type=default” 的 canonicalize。

---

## EditFormModel

**UI 默认骨架**

`createModelOptions` 只创建 `subModels.grid.use='FormGridModel'`，不自动创建 submit action。

证据：

- `/Users/gchust/auto_works/nocobase/packages/core/client/src/flow/models/blocks/form/EditFormModel.tsx`

**难以只靠 skill 推断的结构点**

- `EditFormModel.createResource` 与 `DetailsBlockModel` 同逻辑：`filterByTk` key 是否存在会切换 `SingleRecordResource` vs `MultiRecordResource(pageSize=1)`。
- UI 允许“无 filterByTk 的编辑表单”以分页方式编辑数据，这个行为如果不看源码很难推断；而交付场景通常更希望显式 record context（filterByTk 或 associationName+sourceId）。

**skill 改进建议**

- 文档：
  - 更新 `references/blocks/edit-form.md`：明确 UI 合法的 multi-record/pagination 模式与推荐的稳定 record context 模式。
- Guard：
  - 在 general 模式：当 EditFormModel 缺少 filterByTk/association context 时给 warning（提示会编辑“分页第一条记录”语义）。
  - 在 validation-case：是否 blocker 取决于你们对 validation 的标准（真实可用性 vs UI 可创建性）。

---

## FilterFormBlockModel

**UI 默认骨架**

`createModelOptions` 会创建 `subModels.grid.use='FilterFormGridModel'`，但不会自动创建筛选项与 actions。

证据：

- `/Users/gchust/auto_works/nocobase/packages/core/client/src/flow/models/blocks/filter-form/FilterFormBlockModel.tsx`

**难以只靠 skill 推断的结构点**

- 单个筛选项（`FilterFormItemModel`）的“可用结构”不只靠 `fieldSettings.init`，还需要：
  - `filterFormItemSettings.init.filterField/defaultTargetUid`
  - `subModels.field`，且 field use 需要按字段类型/关联映射
- 折叠/展开布局依赖 `FilterFormGridModel.stepParams.gridSettings.grid.rows` 保存完整 layout；只写 props.rows 往往不够。

**skill 改进建议**

- 文档：
  - 在 `references/blocks/filter-form.md` 增加“最小可用筛选项”结构图，明确 `FilterFormItemModel` 的关键 stepParams 与 subModels.field。
- Guard：
  - 现有 blocker（缺 field 子模型 / 缺 filterField）是必要的；建议补充对 grid rows 的提示性 warning。

---

## GridCardBlockModel

**UI 默认骨架**

- `GridCardBlockModel.createModelOptions` 会创建 `subModels.item.use='GridCardItemModel'`。
- `GridCardItemModel.createModelOptions` 会创建 `subModels.grid.use='DetailsGridModel'`（嵌套默认子树）。
- `GridCardBlockModel.subModels.actions` 是 collection actions 槽位（`CollectionActionGroupModel`）。
- `GridCardItemModel.subModels.actions` 是 record actions 槽位（`RecordActionGroupModel`），新增时 UI 写：
  - `buttonSettings.general.type='link'`
  - `buttonSettings.general.icon=null`

证据：

- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-block-grid-card/src/client/models/GridCardBlockModel.tsx`
- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-block-grid-card/src/client/models/GridCardItemModel.tsx`
- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-block-grid-card/src/server/flow-schema-manifests/index.ts`

**难以只靠 skill 推断的结构点**

- “两层 actions slot”语义不同：block actions 是 collection actions；item actions 是 record actions。只看 `ActionModel` 很容易混。
- `GridCardItemModel` 的嵌套默认子树（grid）如果不看源码很难知道（schema-first 也可能只看到父块的 item slot）。

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/grid-card.md`：写清 item 子树、两层 actions 的 allowed uses 与 UI 默认 buttonSettings 写入。
- Guard：
  - 对 `GridCardBlockModel.subModels.actions` 做 collection action uses 校验（可复用 Table 的集合）。
  - 对 `GridCardItemModel.subModels.actions` 做 record action uses 校验，并可选 canonicalize 补 link/icon 默认值。
  - 若缺失 `subModels.item` 或 item 缺 `subModels.grid`，validation-case 下 blocker（UI 不会产出缺失子树）。

---

## IframeBlockModel

**UI 默认骨架**

- client 侧无 `createModelOptions`，UI Add block 最小通常是 `{ use:'IframeBlockModel' }`。

证据：

- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-block-iframe/src/client/models/IframeBlockModel.tsx`

**难以只靠 skill 推断的结构点**

- 可持久化配置在 stepParams 的固定路径：
  - `stepParams.iframeBlockSettings.editIframe`
  - 其中 `mode` 是必填（`url|html`）
  - `params` 必须是数组 `{name,value}`（不是 object map）
- HTML 模式真正可渲染依赖 `htmlId`：
  - UI 通过 `beforeParamsSave` 把 html 保存到后端资源 `iframeHtml`，然后写回 `htmlId`
  - 只写 `html` 字符串但没有 `htmlId`，最终渲染很可能失败或不可复现

证据：

- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-block-iframe/src/client/models/IframeBlockModel.tsx`（beforeParamsSave）
- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-block-iframe/src/server/flow-schema-manifests/index.ts`（dynamicHints）

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/iframe.md`：写清 `mode/url/htmlId/params/height` 的结构与 HTML 模式的资源依赖。
- Guard：
  - 当 `mode==='url'`：校验 url 非空、params 为数组。
  - 当 `mode==='html'`：若 htmlId 缺失则 warning/blocker（取决于你们是否允许“只落壳等待 UI 保存 htmlId”）。

---

## JSBlockModel

**UI 默认骨架**

`createModelOptions` 只有 `{ use:'JSBlockModel' }`。

证据：

- `/Users/gchust/auto_works/nocobase/packages/core/client/src/flow/models/blocks/js-block/JSBlock.tsx`

**难以只靠 skill 推断的结构点**

- 可持久化配置在 stepParams 固定路径：
  - `stepParams.jsSettings.runJs.code`
  - `stepParams.jsSettings.runJs.version`（默认 `v2`）
- 该 step 使用 `useRawParams:true`，不应把 code 当作模板字段去解析或 canonicalize。

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/js-block.md`：写清 stepParams 路径与“不要模板化 code”的约束。
- Guard：
  - 把 `JSBlockModel` 加入 `BUSINESS_BLOCK_MODEL_USES` fallback（当前 guard 常量缺失会影响 EMPTY_POPUP_GRID 等判定）。
  - 对缺失 code 的 JSBlockModel 给 warning，并可选补一个极简默认代码（例如 `ctx.render('<div/>')`）。

---

## ListBlockModel

**UI 默认骨架**

- `ListBlockModel.createModelOptions` 创建 `subModels.item.use='ListItemModel'`
- `ListItemModel.createModelOptions` 创建 `subModels.grid.use='DetailsGridModel'`
- `ListBlockModel.subModels.actions` 是 collection actions
- `ListItemModel.subModels.actions` 是 record actions（新增时 UI 写 link/icon 默认值）

证据：

- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-block-list/src/client/models/ListBlockModel.tsx`
- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-block-list/src/client/models/ListItemModel.tsx`
- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-block-list/src/server/flow-schema-manifests/index.ts`

**难以只靠 skill 推断的结构点**

- 同样是“两层 actions slot”语义不同，且 item 有嵌套默认 grid 子树。

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/list.md`：写清 item 子树、两层 actions slot、默认 buttonSettings 写入。
- Guard：
  - 同 GridCard：校验 block actions uses 与 item record actions uses；缺少 item 或 item.grid 时在 validation-case 下 blocker。

---

## MapBlockModel

**UI 默认骨架**

- client 侧无 `createModelOptions`，UI Add block 最小通常是 `{ use:'MapBlockModel' }`。

证据：

- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-map/src/client/models/MapBlockModel.tsx`

**难以只靠 skill 推断的结构点**

- map 配置的关键字段是：
  - `stepParams.createMapBlock.init.mapField`，类型是 `string[]`（Cascader 路径，可包含 1 层关联）
  - 单靠 skill 很容易写成 string 或写错路径，导致地图无法显示 marker。
- UI 初始化时会强制写入：
  - `stepParams.popupSettings.openView.disablePopupTemplateMenu = true`
- actions slot 的 allowed uses 来自 `MapActionGroupModel.registerActionModels`，是一个子集：
  - `FilterActionModel` / `AddNewActionModel` / `RefreshActionModel` / `BulkUpdateActionModel`

证据：

- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-map/src/client/models/MapBlockModel.tsx`（onInit）
- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-map/src/client/models/MapActionGroupModel.tsx`（allowed uses）
- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-map/src/server/flow-schema-manifests/index.ts`（dynamicHints）

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/map.md`：写清 mapField 的类型与来源、disablePopupTemplateMenu 的 UI 默认写入、map actions allowed uses。
- Guard：
  - 校验 `mapField` 必须是 string[]。
  - 校验 `MapBlockModel.subModels.actions` uses 必须在 map action 集合内（避免误塞 Table/Details 的 action）。

---

## MarkdownBlockModel

**UI 默认骨架**

- client 侧无 `createModelOptions`，UI Add block 最小通常是 `{ use:'MarkdownBlockModel' }`。

证据：

- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-block-markdown/src/client/models/MarkdownBlockModel.tsx`

**难以只靠 skill 推断的结构点**

- 可持久化配置在 stepParams 固定路径：
  - `stepParams.markdownBlockSettings.editMarkdown.content`（string）
- content 支持 Liquid 模板：handler 里 `ctx.liquid.renderWithFullContext(content, ctx)` 后再 markdown render。
- handler 会写 props：
  - `props.value`（原始 markdown string）
  - `props.content`（渲染后的 ReactNode）
  - 其中 `props.content` 是运行时派生值，不适合作为 skill 硬编码/持久化目标；应以 `stepParams...content` 为准。

证据：

- `/Users/gchust/auto_works/nocobase/packages/core/client/src/flow/flows/editMarkdownFlow.tsx`
- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-block-markdown/src/server/flow-schema-manifests/index.ts`

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/markdown.md`：写清 stepParams 路径与 Liquid 支持。
- Guard：
  - 当 MarkdownBlockModel 缺 content 时给 warning，并可 canonicalize 补一个 `{{t("...")}}` 形式默认值。

---

## ReferenceBlockModel

**UI 默认骨架**

`createModelOptions` 只有 `{ use:'ReferenceBlockModel' }`，但它通常会通过 settings flow 立刻要求选 target/template。

证据：

- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-ui-templates/src/client/models/ReferenceBlockModel.tsx`

**难以只靠 skill 推断的结构点**

- ReferenceBlockModel 的最小可落库结构要求（manifest strict + required）：
  - `stepParams.referenceSettings.target.targetUid`（required）
  - `stepParams.referenceSettings.target.mode`（`reference|copy`）
- `mode=copy` 的语义不是“简单引用”：
  - UI 可能在保存时 duplicate 并替换父 grid rows（属于结构性操作，不只是落库一个子模型）。
  - 目标 subModels 不应被持久化为 `subModels.target`（target 通常是运行时解析出来的，不是稳定 tree）。

证据：

- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-ui-templates/src/server/flow-schema-manifests/index.ts`（required targetUid）
- `/Users/gchust/auto_works/nocobase/packages/plugins/@nocobase/plugin-ui-templates/src/client/models/ReferenceBlockModel.tsx`（target resolution / scoped engine）

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/reference-block.md`：写清 targetUid 必填与 copy 模式的“结构性变换”语义。
- Guard：
  - 缺 `referenceSettings.target.targetUid`：validation-case 与 general 都应 blocker（否则保存阶段可能直接失败或渲染为空）。
  - `mode=copy`：提示性 warning，要求用户明确接受“会改父布局”的风险（或强制走 UI 侧流程，不在 skill 里伪造）。

---

## TableBlockModel

**UI 默认骨架**

- `createModelOptions` 默认会创建 `subModels.columns=[{ use:'TableActionsColumnModel' }]`。
- Table 有两套 actions slot：
  - `TableBlockModel.subModels.actions`：collection actions（`CollectionActionGroupModel`）
  - `TableActionsColumnModel.subModels.actions`：record actions（`RecordActionGroupModel`），新增时 UI 写 `buttonSettings.general.type='link', icon=null`

证据：

- `/Users/gchust/auto_works/nocobase/packages/core/client/src/flow/models/blocks/table/TableBlockModel.tsx`
- `/Users/gchust/auto_works/nocobase/packages/core/client/src/flow/models/blocks/table/TableActionsColumnModel.tsx`
- `/Users/gchust/auto_works/nocobase/packages/core/client/src/flow/models/base/CollectionBlockModel.tsx`（Associated records 菜单模板）

**难以只靠 skill 推断的结构点**

- UI 默认动作列（TableActionsColumnModel）容易被 schema-first minimalExample 漏掉（某些 manifest skeleton 可能给 `columns: []`），导致“写出来的树与 UI 默认不一致”。
- 关系子表（Associated records）的 `resourceSettings.init` 模板：
  - `associationName = field.resourceName`
  - `sourceId` 模板有 `ctx.popup.record.*` 与 `ctx.view.inputArgs.filterByTk` 的特例分支

**skill 改进建议**

- 文档：
  - 更新 `references/blocks/table.md`：补 UI 默认骨架、两套 actions slot、Associated records 模板细节。
  - 更新 `references/patterns/relation-context.md`：补 associationName/sourceId 的 UI 真实模板与特例。
- Guard：
  - 当 TableBlockModel.columns 为空时：warning + canonicalize 自动补 TableActionsColumnModel（对齐 UI）。
  - 继续保持 actions slot allowed uses 校验（已有）。
- Contracts/recipes：
  - `scripts/spec_contracts.mjs` 的 Table required uses 建议默认包含 `TableActionsColumnModel`（对齐 UI 默认）。

