---
title: 公共区块清单与结构盲点
description: 汇总可通过 Add block 添加的 public root blocks，并逐区块列出仅靠 schema-first 难以推断的结构细节与 skill 改进建议。
---

# 公共区块清单与结构盲点

本文件回答两个问题：

1. 常见可 Add block 的 public root blocks 有哪些
2. 对每个可添加区块，哪些结构细节如果只依赖当前 `nocobase-ui-builder` skill 与 schema-first 探测，仍然很容易猜错

## 清单

本清单整理的是已知可通过 Add block 添加的 public root blocks，作为静态参考使用。

当前记录的 `publicTreeRoots` 共 15 个：

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

- UI Add block 的默认骨架
- 仅靠 skill 很难可靠推断的结构点
- 对 `nocobase-ui-builder` skill 的可落地改进建议

---

## ActionPanelBlockModel

**UI 默认骨架**

- `createModelOptions` 只有 `{ use: 'ActionPanelBlockModel' }`
- 已知 skeleton/minimalExample 会带 `stepParams.actionPanelBlockSetting.{layout,ellipsis}` 与 `subModels.actions: []`

**难以只靠 skill 推断的结构点**

- `actions` 槽位允许的 uses 不是 Table/Details 那套 action，而是：
  - `PopupActionModel` / `LinkActionModel` / `JSActionModel` / `ActionPanelScanActionModel`
- settings 的 stepParams 路径固定为：
  - `stepParams.actionPanelBlockSetting.layout.layout`
  - `stepParams.actionPanelBlockSetting.ellipsis.ellipsis`

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/action-panel.md`，明确 action slot uses 与 stepParams 路径。
- Guard：
  - 新增 `ActionPanelBlockModel.subModels.actions` 的 allowed uses 校验。
  - 缺少 `subModels.actions` 时可在 `canonicalize-payload` 自动补 `[]`。
- Recipes/contracts：
  - 当需求是快捷入口或工作台工具条时，把 `ActionPanelBlockModel` 纳入候选。

---

## ChartBlockModel

**UI 默认骨架**

- UI Add block 最小落库通常是 `{ use: 'ChartBlockModel' }`

**难以只靠 skill 推断的结构点**

- 图表真正的可用配置不在 `resourceSettings`，而在：
  - `stepParams.chartSettings.configure.query`
  - `stepParams.chartSettings.configure.chart.option`
  - `stepParams.chartSettings.configure.chart.events.raw`
- 常见 mode 组合：
  - query：`builder | sql`
  - option：`basic | custom`
- 很容易误写成 `resourceSettings.init.collectionName` 的普通列表查询思路。

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/chart.md`，写清 `chartSettings` 路径与 mode 组合。
- Guard：
  - 缺失 `query.mode` / `option.mode` 时给 warning，并可 canonicalize 补默认值。
  - 不要把 chart query canonicalize 到 `resourceSettings`。
- Recipes/contracts：
  - 当命中“图表/报表/分析/sql”关键词时，把 `ChartBlockModel` 加入 schema discovery uses。

---

## CommentsBlockModel

**UI 默认骨架**

- `createModelOptions` 默认会创建 `subModels.items=[{ use: 'CommentItemModel' }]`

**难以只靠 skill 推断的结构点**

- `CommentsBlockModel` 只能用于 `collection.template === 'comment'` 的 collection。
- `subModels.items` 是渲染评论列表的关键；缺少 items 会导致“落库成功但页面空白”。

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/comments.md`，写清 template 约束与默认 item 子树。
- Guard：
  - 若 `CommentsBlockModel` 缺 `subModels.items` 或 items 为空：
    - validation-case：blocker
    - general：warning，并 canonicalize 自动补 `[{ use:'CommentItemModel' }]`

---

## CreateFormModel

**UI 默认骨架**

- `createModelOptions` 只创建 `subModels.grid.use='FormGridModel'`
- 不自动创建 submit action

**难以只靠 skill 推断的结构点**

- 表单可用性不只靠 `fieldSettings.init`，还依赖字段子树、assign rules、关系上下文等结构。
- “UI 默认骨架”与“最小可用”不同：空表单壳合法，但交付场景通常仍需要 submit action。

**skill 改进建议**

- 文档：
  - 更新 `references/blocks/create-form.md`，拆开“UI 默认骨架”和“最小可用标准”。
- Guard：
  - 允许“空 actions”作为 warning。
  - validation-case 保持 blocker。

---

## DetailsBlockModel

**UI 默认骨架**

- `createModelOptions` 会创建 `subModels.grid.use='DetailsGridModel'`
- `subModels.actions` 是 record actions 槽位
- `resourceSettings.init` 是否包含 `filterByTk` key，会影响资源是单记录还是分页第一条记录语义

**难以只靠 skill 推断的结构点**

- `subModels.grid` 是硬必需；缺 grid 的 details 块不是稳定结构。
- details actions 新建时通常会补：
  - `stepParams.buttonSettings.general.type = "default"`
- 关系子表模板里：
  - `associationName` 用 relation 的 `resourceName`
  - `sourceId` 需要跟上下文来源匹配，不能随意猜

**skill 改进建议**

- 文档：
  - 更新 `references/blocks/details.md`，补 grid、actions slot、resourceSettings 关键语义。
  - 更新 `references/patterns/record-actions.md`，补 details actions 的默认 button type。
- Guard：
  - 新增 `DetailsBlockModel` 的 grid 必需校验。
  - 保持 record action allowed uses 校验，并可选 canonicalize 补默认 button type。

---

## EditFormModel

**UI 默认骨架**

- `createModelOptions` 只创建 `subModels.grid.use='FormGridModel'`
- 不自动创建 submit action

**难以只靠 skill 推断的结构点**

- `EditFormModel` 也会受到 `filterByTk` key 是否存在的影响。
- 缺少稳定 record context 时，语义容易漂移到“分页第一条记录”。

**skill 改进建议**

- 文档：
  - 更新 `references/blocks/edit-form.md`，明确 UI 合法的分页模式与推荐的稳定 record context 模式。
- Guard：
  - general：缺 `filterByTk` / association context 时给 warning。
  - validation-case：是否 blocker 继续按真实可用性标准决定。

---

## FilterFormBlockModel

**UI 默认骨架**

- `createModelOptions` 会创建 `subModels.grid.use='FilterFormGridModel'`
- 不会自动创建筛选项与 actions

**难以只靠 skill 推断的结构点**

- 单个 `FilterFormItemModel` 不只依赖 `fieldSettings.init`，还需要：
  - `filterFormItemSettings.init.filterField/defaultTargetUid`
  - `subModels.field`
- 折叠/展开布局依赖 `stepParams.gridSettings.grid.rows`，只写 props.rows 往往不够。

**skill 改进建议**

- 文档：
  - 在 `references/blocks/filter-form.md` 增加“最小可用筛选项”结构图。
- Guard：
  - 保持缺 field 子模型 / 缺 filterField 的 blocker。
  - 增加对 grid rows 的提示性 warning。

---

## GridCardBlockModel

**UI 默认骨架**

- `GridCardBlockModel.createModelOptions` 会创建 `subModels.item.use='GridCardItemModel'`
- `GridCardItemModel.createModelOptions` 会创建 `subModels.grid.use='DetailsGridModel'`
- `GridCardBlockModel.subModels.actions` 是 collection actions 槽位
- `GridCardItemModel.subModels.actions` 是 record actions 槽位
- item actions 新增时常见默认值：
  - `buttonSettings.general.type='link'`
  - `buttonSettings.general.icon=null`

**难以只靠 skill 推断的结构点**

- “两层 actions slot”语义不同：block actions 是 collection actions；item actions 是 record actions。
- `GridCardItemModel` 的嵌套默认子树是 `grid`，容易漏配。

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/grid-card.md`，写清 item 子树和两层 actions slot。
- Guard：
  - 对 `GridCardBlockModel.subModels.actions` 做 collection action uses 校验。
  - 对 `GridCardItemModel.subModels.actions` 做 record action uses 校验。
  - 若缺 `subModels.item` 或 item 缺 `subModels.grid`，validation-case 下 blocker。

---

## IframeBlockModel

**UI 默认骨架**

- UI Add block 最小通常是 `{ use:'IframeBlockModel' }`

**难以只靠 skill 推断的结构点**

- 可持久化配置在：
  - `stepParams.iframeBlockSettings.editIframe`
- 其中：
  - `mode` 必填，通常是 `url | html`
  - `params` 必须是数组 `{ name, value }`，不是 object map
- HTML 模式真正可渲染通常依赖 `htmlId`，不适合只落一个临时 html 字符串。

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/iframe.md`，写清 `mode/url/htmlId/params/height`。
- Guard：
  - `mode==='url'`：校验 url 非空、params 为数组。
  - `mode==='html'`：若 htmlId 缺失则 warning/blocker。

---

## JSBlockModel

**UI 默认骨架**

- `createModelOptions` 只有 `{ use:'JSBlockModel' }`

**难以只靠 skill 推断的结构点**

- 可持久化配置在：
  - `stepParams.jsSettings.runJs.code`
  - `stepParams.jsSettings.runJs.version`
- `runJs` 使用 raw params，不应把 code 当模板字段二次结构化。

**skill 改进建议**

- 文档：
  - 继续通过 `references/js-models/js-block.md` 约束 stepParams 路径与默认渲染方式。
- Guard：
  - 把 `JSBlockModel` 纳入业务区块 fallback。
  - 对缺失 code 的 JSBlockModel 给 warning，并可选补一个极简默认代码。

---

## ListBlockModel

**UI 默认骨架**

- `ListBlockModel.createModelOptions` 创建 `subModels.item.use='ListItemModel'`
- `ListItemModel.createModelOptions` 创建 `subModels.grid.use='DetailsGridModel'`
- `ListBlockModel.subModels.actions` 是 collection actions
- `ListItemModel.subModels.actions` 是 record actions

**难以只靠 skill 推断的结构点**

- 两层 actions slot 语义不同。
- item 有嵌套默认 grid 子树，容易只建父块不建 item 结构。

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/list.md`，写清 item 子树与两层 actions slot。
- Guard：
  - 同 GridCard：校验 block actions uses 与 item record actions uses。
  - 缺少 item 或 item.grid 时在 validation-case 下 blocker。

---

## MapBlockModel

**UI 默认骨架**

- UI Add block 最小通常是 `{ use:'MapBlockModel' }`

**难以只靠 skill 推断的结构点**

- 关键字段是：
  - `stepParams.createMapBlock.init.mapField`
- `mapField` 类型是 `string[]`，不是单个 string。
- UI 常见默认还会写：
  - `stepParams.popupSettings.openView.disablePopupTemplateMenu = true`
- actions slot 的 allowed uses 是一个受限子集，不能直接套 Table/Details 的 action 集合。

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/map.md`，写清 `mapField` 类型与 map actions allowed uses。
- Guard：
  - 校验 `mapField` 必须是 `string[]`。
  - 校验 `MapBlockModel.subModels.actions` uses 必须在 map action 集合内。

---

## MarkdownBlockModel

**UI 默认骨架**

- UI Add block 最小通常是 `{ use:'MarkdownBlockModel' }`

**难以只靠 skill 推断的结构点**

- 可持久化配置在：
  - `stepParams.markdownBlockSettings.editMarkdown.content`
- content 支持 Liquid 模板。
- 真正持久化目标应是原始 markdown string，而不是运行时渲染后的 `props.content`。

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/markdown.md`，写清 stepParams 路径与 Liquid 支持。
- Guard：
  - 当 MarkdownBlockModel 缺 content 时给 warning，并可 canonicalize 补默认值。

---

## ReferenceBlockModel

**UI 默认骨架**

- `createModelOptions` 只有 `{ use:'ReferenceBlockModel' }`

**难以只靠 skill 推断的结构点**

- 最小可落库结构要求：
  - `stepParams.referenceSettings.target.targetUid`
  - `stepParams.referenceSettings.target.mode`
- `mode=copy` 不是简单引用，而是可能带来父布局层面的结构性变换。
- target 不应被持久化成 `subModels.target` 这类稳定子树。

**skill 改进建议**

- 文档：
  - 增加 `references/blocks/reference-block.md`，写清 targetUid 必填与 copy 模式语义。
- Guard：
  - 缺 `targetUid`：validation-case 与 general 都应 blocker。
  - `mode=copy`：给提示性 warning，要求明确接受结构性变化风险。

---

## TableBlockModel

**UI 默认骨架**

- `createModelOptions` 默认会创建 `subModels.columns=[{ use:'TableActionsColumnModel' }]`
- Table 有两套 actions slot：
  - `TableBlockModel.subModels.actions`：collection actions
  - `TableActionsColumnModel.subModels.actions`：record actions
- record actions 列新增时常见默认值：
  - `buttonSettings.general.type='link'`
  - `buttonSettings.general.icon=null`

**难以只靠 skill 推断的结构点**

- UI 默认动作列容易被最小 schema 示例漏掉，导致写出来的树与 UI 默认不一致。
- 关系子表模板里的 `associationName`、`sourceId` 不能随意猜，必须跟上下文来源匹配。

**skill 改进建议**

- 文档：
  - 更新 `references/blocks/table.md`，补 UI 默认骨架、两套 actions slot 和 relation context 细节。
  - 更新 `references/patterns/relation-context.md`，补 `associationName/sourceId` 模板规则。
- Guard：
  - 当 TableBlockModel.columns 为空时：warning + canonicalize 自动补 `TableActionsColumnModel`。
  - 继续保持 actions slot allowed uses 校验。
- Contracts/recipes：
  - `scripts/spec_contracts.mjs` 的 Table required uses 建议默认包含 `TableActionsColumnModel`。
