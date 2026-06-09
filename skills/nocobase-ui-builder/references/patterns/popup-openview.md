---
title: popup / openView
description: drawer/dialog/ChildPage、嵌套 popup 与上下文传递的常见模式。
---

# popup / openView

## 适用区块与问题

适用于：

- `AddNewActionModel`
- `EditActionModel`
- `ViewActionModel`
- popup page / `ChildPageModel`
- 多层 drawer / dialog

优先参考动态场景：

- 主表工作台里的查看 / 编辑 / 新建 popup
- 360 工作台里的详情弹窗
- 多层 drawer / dialog / ChildPage 链路

## 最小 tree 形状

一个稳定的 popup/openView 通常至少包含：

1. action model
2. `popupSettings.openView`
3. `subModels.page`
4. page 下至少一个 tab
5. tab 下的 grid
6. grid 下的实际 block

只写 action 壳，不写 page/tab/grid 子树，不能算真正可用。

builder DSL 边界：

- 当前 build spec 支持 `popup.pageUse + blocks`
- 当前不支持 `popup.tabs` / `popup.layout.tabs`
- 如果目标真的是多 tab popup，明确说明“当前 builder DSL 还不能表达”，不要直接写 `flowModels` 作为兜底。

## 上下文来源

常见来源如下：

| 场景 | 常见来源 |
| --- | --- |
| 主表行 -> 第一层详情弹窗 | 按目标 record context 的 `filterTargetKey` 展开；单键是 `{{ctx.record.<filterTargetKey>}}`，复合键是对象模板 |
| popup page 内部 record block | `{{ctx.view.inputArgs.filterByTk}}`；若是关联子表，只有在 parent->child relation resource 已验证时才升级成 `associationName + sourceId` |
| JS / chart drilldown -> popup table filter | `ctx.openView(..., { defineProperties: { drilldownValue: { value, meta } } })`，popup 内表格数据范围使用 `{{ctx.drilldownValue}}` 这类顶层变量 |
| 二层 popup 继续编辑当前子表记录 | 先取当前弹窗表格行的 record key（按该行 collection 的 `filterTargetKey` 展开），再传给下一层 `filterByTk` |
| 详情动作查看关联客户 | 只有在当前详情 record 结构明确时，才使用类似 `{{ctx.record.customer.id}}` 的表达式 |

## 决策规则

- 能显式写 `filterByTk` 时，优先显式写，不要完全依赖隐式 runtime 注入
- 不要把 record popup 的 `filterByTk` 固定写成 `{{ctx.record.id}}`；默认按 live metadata 的 `filterTargetKey` 展开
- `openView.pageModelClass` 必须与 `subModels.page.use` 严格一致；默认优先 `ChildPageModel`，但上游也允许 `RootPageModel` / `PageModel`
- popup page 的 tab use 要跟父 page 对齐：`ChildPageModel -> ChildPageTabModel`
- 对 popup 内“当前记录的关联子表”，只有在 parent->child relation resource 已验证时才优先走 `resourceSettings.init.associationName + sourceId`；否则允许保留 child-side 的逻辑 `dataScope.filter`，但 `path` 必须来自 relation metadata，优先 `foreignKey`，否则 `<belongsToField>.<targetKey>`
- `associationName` 不能只复用子表指向父表的 `belongsTo` 字段名；`order` 和 `order_items.order` 这类 child-side 写法都不能算“已完成”
- 如果弹窗入口来自表格里的关联标题列，不要默认让 `customer.name` 这种 dotted path 列自己承担 click-to-open；优先回到 [clickable-relation-column.md](clickable-relation-column.md) 的原生关系列方案
- 多层 popup 时，每一层都要能说清楚“输入参数从哪一层来”
- 当用户用当前 admin URL 指认多层 popup 链路里的“这一层”时，起始 opener uid 默认取 URL 中最后一个 `view/<uid>`，不是外层 popup 的 opener；如果没有 `view/<uid>`，才回退到 `admin/<pageSchemaUid>` 并使用 page-level `get --page-schema-uid` 读取。
- URL 解析只决定从哪一层开始展开，不推断最终 block / form；从这个起始 opener uid 开始，继续沿用现有 popup `inputArgs`、template、content 展开逻辑。
- 例：外层 `view` 打开详情 popup，内层 `view` 是详情内的编辑动作；用户给完整深链 URL 时，从内层 `view` 开始继续展开，而不是先停在外层详情块。
- popup page 下的 record/edit/details block 可依赖显式 `filterByTk` / `sourceId` 等 `ctx.view.inputArgs`；JS 或 chart click 传入给区块配置使用的动态筛选值，必须用 `defineProperties` 注入顶层变量，不要放进 `params`
- popup/openView 相关写入前先按 [../execution-checklist.md](../execution-checklist.md) 与 [../normative-contract.md](../normative-contract.md) 做自检
- through / 中间表 popup 的 add/edit 动作，只有在用户明确要求打开浏览器或确认运行时动作可用性时，才需要一次最小 smoke；否则保持“模型树已落库，运行时未实测”

## JS-triggered popup / 模板优先

当 JSBlock、JS Action、event-flow JS、chart `events.raw` 要打开 drawer/dialog 时，先落库或复用一个 template-first popup-capable FlowModel，再写 JS：

- `triggerUid` 是 JS 传给 `ctx.openView(triggerUid, ...)` 的 uid；默认用已落库 popup host/action uid
- `targetUid` 是 host 上 `popupSettings.openView.uid`；模板命中时它通常指向 popup template 的 target FlowModel
- 优先用 `popup.template` 或 `popup.tryTemplate=true` 让 host 保留 `popupTemplateUid` / `popupTemplateMode="reference"`；读回后再决定 JS 触发哪个 uid
- 只有读回证明模板 target 本身是 popup-capable FlowModel 时，才允许直接把模板 `targetUid` 当 `triggerUid`
- `ChildPageModel` is not a `triggerUid`; page、tab、popup subtree uid 也不是默认触发目标
- JS / chart 下钻要给弹窗内区块配置传变量时，用 `defineProperties` 注入带 `meta` 的顶层变量，例如 `importanceLevel` / `productName`；popup 内表格 `dataScope` 使用 `{{ctx.importanceLevel}}`，禁止使用 `{{ctx.view.inputArgs.params.*}}`
- 如果入口只是给图表 `ctx.openView()` 复用的 popup host，必须隐藏这个 host：先 `get-reaction-meta`，再写 `actionLinkage` / `blockLinkage`。不要留下可见行按钮直接打开一个依赖 chart-only `defineProperties` 的弹窗。

## 常见误区

- 只有 action 按钮，没有完整 page/tab/grid 子树
- `openView.pageModelClass` 写成 `ChildPageModel`，但 `subModels.page.use` 仍是 `PageModel` 或其他壳
- `subModels.page.use=ChildPageModel`，但 tab 还停在 `PageTabModel`
- 第一层 popup 能打开，但第二层继续依赖外层 `ctx.record`
- 不区分“当前列表行 record”与“当前 popup inputArgs”
- child-side `belongsTo` 过滤直接写裸关联字段名，再配 `$eq` / `$ne` 这类标量操作符
- 把子表 `belongsTo(parent)` 的字段名直接当成 `associationName` 提交，却没有证明运行时资源真的存在
- 对关联客户这类深路径表达式不做说明，直接报成功
- popup page 下业务 block 依赖 `ctx.view.inputArgs.filterByTk`，但 action 层没有显式传 `filterByTk`
- 图表下钻把点击值放进 `params`，再让表格数据范围读取 `ctx.view.inputArgs.params.*`
- 因为用户要“点关联标题打开弹窗”，就直接改成 JS 单元格，而不是先收口到原生关系列
- JS 直接打开临时 uid、`ChildPageModel` uid、page/tab uid，绕过 popup host / `popupTemplateUid` 路由

## 完成标准

- 已落库：action tree、page、tab、grid、block 都存在
- 已解释：每一层 popup 的 record context 来源都能说清楚
- 已验证：如果还没做浏览器交互回放，最终结果必须明确写成“模型树已落库，运行时上下文未实测”
- 对 through / 中间表动作，若尚未做 smoke，不能把“按钮存在”或“drawer 能打开”直接写成通过

## 关联文档

- [../blocks/table.md](../blocks/table.md)
- [../blocks/details.md](../blocks/details.md)
- [../blocks/create-form.md](../blocks/create-form.md)
- [../blocks/edit-form.md](../blocks/edit-form.md)
- [clickable-relation-column.md](clickable-relation-column.md)
- [../execution-checklist.md](../execution-checklist.md)
- [relation-context.md](relation-context.md)
- [record-actions.md](record-actions.md)
