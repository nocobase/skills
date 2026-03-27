---
name: nocobase-ui-builder
description: 通过 MCP 创建、读取、更新、移动、删除 NocoBase Modern page (v2) 页面与区块；validation、review、smoke 仅在用户明确要求时进入。
allowed-tools: All MCP tools provided by NocoBase server, plus local Node for scripts/*.mjs under this skill
---

# 目标

通过 `desktopRoutes` 与 `flowModels` MCP 工具处理 NocoBase Modern page (v2) 页面与区块。

这个 skill 覆盖：

- create / read / update / move / delete 页面、tab、block、action、JS model
- route-ready、readback、payload guard 驱动的结构化交付
- validation / review / improve / smoke，但只在用户明确要求时进入

顶层 `SKILL.md` 只保留触发边界、统一入口、少量硬 gate 和最终汇报轴。具体任务路由、recipe、block/pattern/JS 契约都以下面的 canonical docs 为准：

- [references/index.md](references/index.md)

## 何时触发

- 用户要创建、读取、更新、移动、删除 Modern page (v2) 页面或区块
- 用户要用 `desktopRoutes v2` / `flowModels` 修改现有 Modern page
- 用户要求 route-ready、readback、guard 或结构化 validation 结论
- 用户明确要求 validation / review / improve / smoke / 浏览器验证

## 何时不要触发

- 只处理 collections / fields / relations：改用 `nocobase-data-modeling`
- 只处理 workflow：改用 `nocobase-workflow-manage`
- 只做 MCP 安装或连接：改用 `nocobase-mcp-setup`

## 统一入口

1. 先打开 [references/index.md](references/index.md)。
2. 按任务路由补读对应 canonical docs、recipes、block docs、pattern docs、JS docs。
3. 默认执行方式是：agent 先直接调用 NocoBase MCP，拿到 write/readback/route/anchor 等 artifact，再通过 `node scripts/ui_write_wrapper.mjs run --action <create-v2|save|mutate|ensure> ...` 做本地 guard、汇总和落盘。
4. wrapper 现在只负责 `start-run -> guard -> consume write artifact -> consume readback artifact -> finish-run`；不要在脚本里直接请求 NocoBase，也不要在外层手动拆流程。
5. validation / review / improve 只有在用户明确要求时才进入；未进入浏览器验证时，`browser_attach` / `smoke` 要记为 `skipped`。

## 默认硬 gate

1. 只要能探测，就不要猜 `use`、slot、`requestBody` 结构。
2. 任何探测或写操作前都必须先 `start-run`；不要先探测、后补日志。
3. 裸 `PostDesktoproutes_createv2` / `PostFlowmodels_save` / `PostFlowmodels_mutate` / `PostFlowmodels_ensure` 默认全部禁用；agent 应先走 MCP，再把证据交给 `ui_write_wrapper.mjs`。
4. `preflight_write_gate.mjs`、`flow_write_wrapper.mjs`、`rest_validation_builder.mjs`、`rest_template_clone_runner.mjs` 现在都是本地 helper / 兼容组件，不再是默认 agent 写入口；不要手动拆成“先 gate、再自己写、再自己补 readback”。
5. `createV2` 成功只代表 `page shell created`；没有 route-ready 与 anchor readback 证据前，不得报页面 ready。
6. `save` / `mutate` / `ensure` 返回 `ok` 只代表请求提交成功；最终以后续 readback 为准。
7. 对现有页面默认做局部补丁，不要为了局部改动重建整棵页面树。
8. flowPage v2 一律走 anchor-first：`RootPageModel` 必须写 `parentId=<pageSchemaUid>, subKey=page` 的 anchor child；不要把页面 route `schemaUid` 直接当 `RootPageModel.uid` 保存。
9. `RootPageModel` 的可见 tabs 一律走 route-driven：不要把 `subModels.tabs` 直接写进 page anchor；多个可见 tab 先建 child desktopRoutes，再分别写各自 `parentId=<tabSchemaUid>, subKey=grid`。
10. 未经 schema / graph 放行的内部、未解析或高风险 model/use，不得直接写入。
11. 除非用户明确要求打开浏览器、进入页面或做 runtime / smoke 验证，否则不要主动 attach / launch 浏览器。
12. validation 结论必须拆开 `page shell`、`route-ready`、`readback`、`data`、`runtime`，不能合并成一个“成功”。
13. live tree patch 禁止靠“旧 uid + 新 parent/subKey/subType”做 reparent；需要移动、克隆或重挂载业务子树时，默认 fresh remap descendants，而不是复用旧 block uid。
14. 只要 `gridSettings.rows` 与 `subModels.items` 成员不一致，就视为高风险坏树；`save ok` 但 readback 没有稳定 `items` / slot membership 时，一律不得报成功。

## validation / review 子路径

只有在用户明确要求 validation / review / improve / smoke 时才进入这一支：

- 结构化 validation 规则见 [references/validation.md](references/validation.md)
- run log、phase/gate、report、improve 规则见 [references/ops-and-review.md](references/ops-and-review.md)

如果用户没有明确要求浏览器验证：

- 只做到 route-ready、readback、data-ready 这一级
- `browser_attach` / `smoke` 记为 `skipped (not requested)`
- `runtime-usable` 汇报为 `not-run`

## 最终汇报轴

最终说明和 review report 默认至少单独汇报这些轴：

- `pageShellCreated`
- `routeReady`
- `readbackMatched`
- `dataReady`
- `runtimeUsable`
- `browserValidation`
- `dataPreparation`
- `pageUrl`

允许出现的保守状态包括：

- `not-recorded`
- `evidence-insufficient`
- `skipped (not requested)`
- `not-run`

没有 route-ready 或 readback 证据时，不要写“页面已可打开”或“已落库完成”。

如果本轮实际创建或更新了页面，并且能够拿到 `adminBase`、候选页面 URL 或其他可推导地址，最终结果必须给出实际页面 URL，方便用户点击查看；只有确实无法推导时，才允许说明阻塞原因。
