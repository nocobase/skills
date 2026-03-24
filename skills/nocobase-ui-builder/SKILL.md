---
name: nocobase-ui-builder
description: 通过 MCP 构建和更新 NocoBase Modern page (v2) UI。用户要创建页面，或通过 desktopRoutes v2 与 flowModels MCP 工具修改现有页面区块时使用。
allowed-tools: All MCP tools provided by NocoBase server, plus local Node for scripts/*.mjs under this skill
---

# 目标

通过 NocoBase MCP 工具构建、读取、更新、做结构化校验并复盘 Modern page (v2) UI。浏览器验证只在用户明确要求打开浏览器时进行。

这个 skill 继续是单入口的全包 skill，但顶层 `SKILL.md` 只负责：

- 判断任务属于哪一类
- 决定先读哪些 reference
- 固定统一执行流程与少量硬 gate
- 明确哪些结论可以报成功，哪些不行

具体 API 细节、payload 契约、validation 判定、日志与复盘规则，全部以下面列出的 canonical reference 为准，不要在这里重复发明一套。

# 适用范围

适用于以下任务：

- 创建、读取、更新、移动、删除 Modern page (v2) 页面与区块
- 在默认 tab、显式 tabs、popup/page 子树中操作公共区块
- 基于 schema-first 探测结果扩展稳定的字段渲染、动作树、关系区块与 JS model
- 按 route-ready、readback、data-ready 做结构化 validation、review 和自动改进
- 仅在用户明确要求打开浏览器时做 runtime / smoke 验证

当前常见 MCP 工具族包括：

- `desktopRoutes`：`PostDesktoproutes_createv2`、`PostDesktoproutes_destroyv2`、`PostDesktoproutes_updateorcreate`、`GetDesktoproutes_getaccessible`、`GetDesktoproutes_listaccessible`
- `flowModels`：`GetFlowmodels_findone`、`GetFlowmodels_schema`、`PostFlowmodels_schemas`、`PostFlowmodels_schemabundle`、`PostFlowmodels_save`、`PostFlowmodels_ensure`、`PostFlowmodels_mutate`、`PostFlowmodels_move`、`PostFlowmodels_destroy`、`PostFlowmodels_attach`、`PostFlowmodels_duplicate`

规则：

- 只要这些 MCP 工具名可用，就必须原样使用
- 不要把 REST 路径本身当作工具名
- 如果 MCP 未配置，先使用 `../nocobase-mcp-setup/SKILL.md`

# 先读哪里

开始前先打开总索引：

- [references/index.md](references/index.md)

之后按任务类型选择 canonical reference：

- API 生命周期、请求格式、schema-first 探测、route-ready、readback：
  [references/ui-api-overview.md](references/ui-api-overview.md)
- 页面骨架与 section 规划：
  [references/page-first-planning.md](references/page-first-planning.md)
- 总览 / 看板 / 趋势 / KPI / 交互说明页的候选 recipe：
  [references/insight-first-recipe.md](references/insight-first-recipe.md)
- 常见起手式与通用 recipe：
  [references/flow-model-recipes.md](references/flow-model-recipes.md)
- 本地 flow schema graph：
  [references/flow-schemas/index.md](references/flow-schemas/index.md)
- 写前 guard、blocker/warning、risk-accept：
  [references/patterns/payload-guard.md](references/patterns/payload-guard.md)
- 真实可用性 validation、数据前置、噪声与成功标准：
  [references/validation.md](references/validation.md)
- 日志、phase/gate、cache、复盘报告与自动改进：
  [references/ops-and-review.md](references/ops-and-review.md)
- opaque page/node uid 生成规则：
  [references/opaque-uid.md](references/opaque-uid.md)

如果任务已经明显落到具体区块或横切模式：

- 先读区块索引：[references/blocks/index.md](references/blocks/index.md)
- 看板 / 趋势 / 占比 / KPI / 概览类请求，直接补读：
  [references/insight-first-recipe.md](references/insight-first-recipe.md),
  [references/blocks/chart.md](references/blocks/chart.md),
  [references/blocks/grid-card.md](references/blocks/grid-card.md)
- 如果请求同时带 `交互 / 联动 / 说明 / 引导 / 叙事 / 自定义`，同一轮要把
  [references/js-models/index.md](references/js-models/index.md)
  一起读掉，把 `JSBlockModel` 当作 insight peer，而不是最后兜底。
- 再读模式索引：[references/patterns/index.md](references/patterns/index.md)
- JS / RunJS 相关先读：[references/js-models/index.md](references/js-models/index.md)

# 默认工作方式

## 1. 页面优先，不是区块优先

默认先根据用户意图规划页面骨架和 section，再为每个 section 选择 block。

- 普通工作台、详情页、复杂 tab 页面，先看 `page-first-planning`
- 不要一上来按 block catalog 倒推页面
- `JSBlockModel` 不是页面骨架本身，但在 `insight / extension` 中可以和 `ChartBlockModel / GridCardBlockModel` 并列成为主表达面

## 2. schema-first，不猜结构

默认顺序：

1. 先看本地 flow schema graph
2. 再用 `PostFlowmodels_schemabundle` 做 root block / 运行时结构探测
3. 再用 `PostFlowmodels_schemas` 拉齐本轮目标 use
4. 只有仍未消歧时，才用 `GetFlowmodels_schema`
5. 写前再读 live tree，写后再读一次做 readback

默认不要：

- 猜 `requestBody` 字段键
- 猜 `subModels.<slot>` 形状
- 猜模型 `use`
- 因为“想稳一点”而重复读取同一个 page/grid

## 3. 本地 graph 先于远端 schemas

如果只是要核对某个模型或 slot 的结构，优先读：

- [references/flow-schemas/index.md](references/flow-schemas/index.md)
- `flow-schemas/manifest.json`
- `flow-schemas/models/<UseName>.json`
- `flow-schemas/catalogs/<OwnerUse>.<slot>.json`

只有以下场景才回退到运行时 schema 工具：

- 本地 graph 缺少目标 `use`
- 本地 graph 与当前实例行为明显冲突
- 当前任务涉及 graph 未覆盖的新模型或新插件结构

## 4. block/pattern 先于顶层推理

当任务进入 block-level 搭建时，不要继续只靠 `SKILL.md` 推理：

- block 问题先看 `blocks/*.md`
- popup/openView、关系上下文、record actions、tree、多对多先看 `patterns/*.md`
- 只要需求里同时出现“表格列 + 关联字段 + 点击打开 / popup”，优先看 `patterns/clickable-relation-column.md`
- JS model 一律先看 `js-models/*.md`

如果索引里没有对应文档，再退回 `ui-api-overview + flow-model-recipes + payload-guard` 的通用规则，并在日志里记一条 `note` 说明缺口。

# 统一执行流程

## A. 预检

1. 确认 NocoBase MCP 已连接且相关工具可见
2. 确认本地 Node 可用
3. 如果本轮包含写操作，先按 [references/ops-and-review.md](references/ops-and-review.md) 初始化 run log

## B. 规划页面

1. 先确定页面骨架：`focus-stack` / `split-workbench` / `multi-section-workbench` / `tabbed-workbench`
2. 再确定 section：`controls`、`primary`、`secondary`、`insight`、`extension`
3. 再为每个 section 选 block
4. 多页面请求优先编译成 page-level spec，逐页执行；不要把聚合请求继续当成单页 builder 输入
5. 命中总览 / 看板 / 趋势 / KPI / 交互说明时，默认按 `insight-first` 生成候选，不强制保留 `Table/Details` 版本

## C. 探测与定界

1. 先读本地 flow schema graph
2. 用 `PostFlowmodels_schemabundle` 做运行时 root block 发现
3. 收敛本轮目标 use
4. 用一次 `PostFlowmodels_schemas` 拉齐目标 use
5. 只有仍未消歧时，才用 `GetFlowmodels_schema`
6. 对本轮目标树做一次写前 live snapshot

## D. 组装 payload

1. 先按 `flow-model-recipes` 或 block/pattern 文档构造 draft payload
2. 如需关系筛选/selector/dataScope condition，先用 `flow_payload_guard.mjs build-filter`
3. 如需页面或节点 uid，一律按 [references/opaque-uid.md](references/opaque-uid.md) 通过脚本生成
4. 不要手写语义化 page/node uid
5. 如果需求是“关联标题列点击打开 popup”，默认先收口到原生关系列方案，不要直接生成 `dotted path + click-to-open` 或 JS workaround

## E. 写前 guard

落库前固定走这条流水线：

1. `extract-required-metadata`
2. 补 collection / field / relation metadata
3. 必要时做第二轮 metadata 扩展
4. `canonicalize-payload`
5. `audit-payload`
6. 只有无 blocker，或明确写入结构化 `risk_accept` note 后再次审计通过，才允许写入

guard 细则、blocker/warning、risk-accept 语义以：

- [references/patterns/payload-guard.md](references/patterns/payload-guard.md)

为准。

## F. 写入与 readback

1. 单树已知结构优先 `PostFlowmodels_save`
2. 多步事务、`$ref` 串联或可重试 upsert 优先 `PostFlowmodels_mutate`
3. 缺 object child 且 schema 已证明本应存在时才用 `PostFlowmodels_ensure`
4. 排序只用 `PostFlowmodels_move`
5. 删除只用 `PostFlowmodels_destroy`
6. 写后立刻做同目标 readback，对账结论以后续 `GetFlowmodels_findone` 为准，不以 save/mutate 的 `ok` 为准

具体工具选择和写后对账规则以：

- [references/ui-api-overview.md](references/ui-api-overview.md)

为准。

## G. validation 与 review

当用户明确要求 validation 时：

1. 先完成 route-ready 和 readback 对账
2. 再按 [references/validation.md](references/validation.md) 做数据前置、结构化可用性判断和噪声归类
3. 只有用户明确要求“打开浏览器”“进入页面”“做 smoke / runtime 验证 / 交互复现”时，才进入浏览器验证
4. 未进入浏览器验证时，`browser_attach` / `smoke` 必须记为 `skipped`，并把 `runtime-usable` 明确汇报为 `not-run` / `unverified`
5. 最后按 [references/ops-and-review.md](references/ops-and-review.md) 生成 review / improve 产物

# 默认硬 gate

以下规则是顶层唯一保留的硬 gate；更细的约束全部以下游 canonical docs 为准。

1. 只要能探测，就不要猜模型、slot、requestBody 结构。
2. 任何 `save` / `mutate` 之前都必须过 payload guard。
3. `PostFlowmodels_save` / `PostFlowmodels_mutate` 返回 `ok` 只代表请求提交成功；最终状态以后续 readback 为准。
4. `createV2` 成功只代表 page shell 已创建，不代表页面已经可打开；没有 route-ready 证据前，不得报 ready。
5. `page shell created`、`route-ready`、`readback matched`、`data-ready`、`runtime-usable` 必须分开汇报，不能混成一个“成功”。
6. 对现有页面默认做局部补丁，不要为了一个局部改动重建整棵页面树。
7. validation 结论必须基于真实故障信号和数据可用性，不要把 React warning 当失败。
8. 除非用户明确要求打开浏览器、进入页面或做 runtime / smoke 验证，否则不要主动 attach / launch 浏览器，也不要为了补证据自行进入页面。
9. 任何已标记为内部、未解析、或 schema 未放行的 model/use，都不能直接写入。
10. 生成 RunJS / JSBlock 代码时，不要默认假设浏览器全局 `fetch`、`localStorage` 或任意 `window.*` 可用；当前登录用户优先使用 `ctx.user` / `ctx.auth?.user`，NocoBase collection/list/get 默认使用 `ctx.initResource()` + `ctx.resource` 或 `ctx.makeResource()`，只有自定义端点或 request-only 场景才使用 `ctx.request()`。
11. 表格里的关联标题字段如果要点击打开 popup，默认不要让 dotted path 列自己承担 click-to-open，也不要默认切去 `JSFieldModel` / `JSColumnModel`；先回到原生关系列方案。
12. payload guard 只负责合法性与风险检查，不参与 block 排序；不要因为 guard 存在就在 planner 阶段提前回退到 `TableBlockModel` / `DetailsBlockModel`。

# 任务路由

## 创建/删除页面

先读：

- [references/ui-api-overview.md](references/ui-api-overview.md)
- [references/opaque-uid.md](references/opaque-uid.md)
- [references/flow-model-recipes.md](references/flow-model-recipes.md)

重点关注：

- `createV2` / `destroyV2` 生命周期
- `schemaUid` 与默认隐藏 tab 规则
- route-ready、page root、default grid 三件事要分开确认

## 读取/更新/移动/删除区块

先读：

- [references/page-first-planning.md](references/page-first-planning.md)
- [references/flow-model-recipes.md](references/flow-model-recipes.md)
- [references/ui-api-overview.md](references/ui-api-overview.md)

然后按具体 block / pattern 继续下钻。

## popup/openView、关系区块、record actions、tree、多对多

先读：

- [references/patterns/index.md](references/patterns/index.md)

尤其优先：

- `clickable-relation-column.md`
- `popup-openview.md`
- `relation-context.md`
- `record-actions.md`
- `tree-table.md`
- `many-to-many-and-through.md`

## JS / RunJS

先读：

- [references/js-models/index.md](references/js-models/index.md)
- [references/js-models/rendering-contract.md](references/js-models/rendering-contract.md)

硬规则：

- 只要普通列 / 原生关系列能表达，就不要默认生成 `JSFieldModel` / `JSColumnModel`
- “关联标题列点击弹窗”只有在用户明确要求 JS 时，才允许走 JS 方案
- 渲染型 JS model 默认使用 `ctx.render()`
- 渲染型 JS model 命中 `ctx.element.innerHTML = ...` 时，先尝试自动改写为 `ctx.render(...)`；仍残留则视为 blocker
- 不把 `return value` 当作 `JSBlockModel` / `JSColumnModel` / `JSFieldModel` / `JSItemModel` 的默认渲染范式

## 需要看某个 use/slot 的具体 schema

先读：

- [references/flow-schemas/index.md](references/flow-schemas/index.md)

如果本地 graph 不够，再回到 `PostFlowmodels_schemas` / `GetFlowmodels_schema`。

## validation / review / 改进

先读：

- [references/validation.md](references/validation.md)
- [references/ops-and-review.md](references/ops-and-review.md)

如果用户已经明确要求“打开页面/弹窗、串行复现错误、汇总根因和建议”，可以继续使用 `nocobase-ui-validation-review` 做浏览器复现与单文件 HTML 复盘。

# 输出要求

最终说明默认至少拆开这些事实：

- 做了哪些探测
- 写入是否真正落库
- 页面是否 route-ready
- readback 是否匹配预期
- validation 是否完成
- 是否进入浏览器验证；若未进入，明确写 `skipped (not requested)`
- 数据前置是否完成
- 本轮报告 / improve 产物路径

允许报 `partial` / `failed` 的典型情况：

- page shell 已创建，但 route not ready
- save/mutate 返回 `ok`，但 readback mismatch
- UI 已创建，但数据前置未完成
- 结构已落库，但运行时未实测

不要在以下情况下报“已完成”：

- 只有 `createV2` 成功，没有 route-ready
- 只有 `save/mutate` 成功，没有 readback
- 只有页面壳存在，没有数据前置与 runtime 可用性验证

# 参考资料

- 总索引：[references/index.md](references/index.md)
- API / lifecycle：[references/ui-api-overview.md](references/ui-api-overview.md)
- 页面规划：[references/page-first-planning.md](references/page-first-planning.md)
- insight-first recipe：[references/insight-first-recipe.md](references/insight-first-recipe.md)
- 通用 recipe：[references/flow-model-recipes.md](references/flow-model-recipes.md)
- 本地 flow schema graph：[references/flow-schemas/index.md](references/flow-schemas/index.md)
- 写前 guard：[references/patterns/payload-guard.md](references/patterns/payload-guard.md)
- validation：[references/validation.md](references/validation.md)
- 日志 / review / improve：[references/ops-and-review.md](references/ops-and-review.md)
- opaque uid：[references/opaque-uid.md](references/opaque-uid.md)
