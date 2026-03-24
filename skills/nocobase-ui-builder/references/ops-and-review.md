---
title: 运行日志与复盘
description: nocobase-ui-builder 的 run log、phase/gate/cache、review 报告与自动改进闭环。
---

# 运行日志与复盘

这个文档是 `nocobase-ui-builder` 的运行治理入口。顶层 `SKILL.md` 只保留“要做日志与复盘”，具体路径、命令、事件类型、报告要求都以这里为准。

## 什么时候读

- 本轮存在任何探测或写操作
- 需要记录 phase/gate/cache
- 需要做 write-after-read 对账
- 需要生成 review / improve 报告
- 需要解释为什么本轮是 `success` / `partial` / `failed`

## 默认目录

- 默认会按当前 session 自动解析运行目录；通常不需要手动指定。
- 需要固定 session root 时，可显式传 `--session-id`，或设置 `NOCOBASE_UI_BUILDER_SESSION_ID` / `NOCOBASE_UI_BUILDER_SESSION_ROOT`。
- 需要整体迁移 state 目录时，可设置 `NOCOBASE_UI_BUILDER_STATE_DIR`。
- 默认本地 state 会落到 agent-neutral 的 `~/.nocobase/state/...`；如果检测到旧的 `~/.codex/state/...` 且新目录尚未使用，会自动复用旧目录。

`sessionId` 默认按当前 agent 进程的 PID 与工作目录派生；需要跨多条命令稳定复用时，可显式传 `--session-id` 或设置 `NOCOBASE_UI_BUILDER_SESSION_ID`。

## 默认阶段

每轮至少记录这些阶段：

- `schema_discovery`
- `stable_metadata`
- `write`
- `readback`
- `browser_attach`
- `smoke`

如果本轮没有进入浏览器验证，`browser_attach` / `smoke` 可以记为 `skipped`，不要假装它们不存在。

默认前提是：只有用户明确要求“打开浏览器”“进入页面”或“做 runtime / smoke 验证”时，才进入这两个阶段；否则应主动记为 `skipped`，并在 `note` / `gate` 中写明 `browser not requested`。

## 运行时优化基线

### 稳定信息缓存

- 只缓存稳定结果：`schemaBundle`、`schemas`、collection fields、relation metadata
- 不缓存 live tree、write 后 readback、页面运行时结果
- 优先复用 `scripts/stable_cache.mjs`

### 平台噪声基线

- React invalid prop、deprecated、重复注册、FlowEngine circular warning 优先归到 baseline
- 真正的 runtime exception 继续保持 blocking
- 优先复用 `scripts/noise_baseline.mjs`

### 契约归一化与 gate

- 能编译成 BuildSpec / VerifySpec 时，优先经 `scripts/spec_contracts.mjs`
- gate 判断优先复用 `scripts/gate_engine.mjs`
- 停止条件不要散落在 prompt 自由文本里

## tool_journal

开始任何探测或写操作前，先初始化本轮日志：

```bash
node scripts/tool_journal.mjs start-run \
  --task "<用户请求>" \
  [--title "<title>"] \
  [--schemaUid "<schemaUid>"] \
  [--session-id "<sessionId>"]
```

最低要求：

1. 保存 `start-run` 返回的 `logPath`
2. 每次 MCP 调用后立即记录 `tool_call`
3. 每次本地脚本调用后也记录 `tool_call`
4. 关键分支判断写 `note`
5. 关键阶段写 `phase`
6. gate 结果写 `gate`
7. cache 命中/失效写 `cache-event`
8. 最终必须写 `run_finished`

## ad-hoc 写入口

如果这轮不是走 `rest_validation_builder.mjs` / `rest_template_clone_runner.mjs` 这种内建流水线，而是临时直接改一个 live tree、JSBlock、action tree、tab 子树，或直接创建页面壳，不允许裸调 `PostDesktoproutes_createv2` / `PostFlowmodels_save` / `PostFlowmodels_mutate` / `PostFlowmodels_ensure`。

统一入口改为：

```bash
node scripts/ui_write_wrapper.mjs run \
  --action save \
  --task "<task>" \
  --payload-file "<payload.json>" \
  --metadata-file "<metadata.json>" \
  --readback-parent-id "<parentId>" \
  --readback-sub-key "<subKey>"
```

规则：

1. wrapper 固定执行 `start-run -> guard -> write -> readback -> finish-run`；agent 不要在外层自行拆分这些阶段。
2. `--action create-v2|save|mutate|ensure` 由 wrapper 统一收口；只有在实现或调试 wrapper 本身时，才允许单独运行底层工具。
3. 默认 `mode=validation-case`；只有明确在调试草稿时，才允许单独用 `preflight_write_gate.mjs` 看 guard 结果。
4. 如果退出码是 `2`，说明 guard blocker 已阻止写入；如果退出码是 `1`，说明写入或 readback 验证未通过。
5. `flow_write_wrapper.mjs` 仍可作为 flow-only 兼容脚本存在，但不再是默认 agent 入口。
6. wrapper 写前会尽量读取 live topology；如果 payload 里某个已存在 uid 试图改变 `parentId/subKey/subType`，必须在 write 前失败，不能放到 save 后靠页面空白再排查。
7. 对显式布局 grid，`gridSettings.rows/rowOrder/sizes` 与 `subModels.items` 必须双向对齐；rows 引用了孤儿 uid，或 items 没进任何 row，都视为 tree-path failure。
8. `save ok` 但 readback 的 slot membership 不完整，默认归类为 `failed` 或 `partial`；不要写成“已落库完成”。

## tool_call 记录要求

- `toolType=mcp` 的 `ok/error` 记录必须附 raw evidence
- `result-file` / `error-file` 至少能追溯到 top-level `call_id`
- 若工具面提供 `exec_id`，一并写入
- 不允许只靠自由文本 `summary` / `error` 冒充证据

对会参与 write-after-read 对账的调用：

- `PostFlowmodels_save`
- `PostFlowmodels_ensure`
- `PostFlowmodels_mutate`
- 配套同目标 `GetFlowmodels_findone`

都要显式写同一个 `args.targetSignature`。

## write-after-read 结论

默认以后续 readback 为准，不以下列信号直接报成功：

- `save` / `mutate` 返回 `ok`
- `createV2` 成功
- flow model anchor 存在

结构化摘要至少应覆盖：

- 目标 page / tab / grid 是否存在
- 显式 tabs 与 duplicate tabs
- `filterManager`
- selector / `filterByTk` / `dataScope` 摘要
- block 是否真正挂到预期 slot
- `gridSettings.rows` 与 `subModels.items` 是否成员一致

readback mismatch 时，默认降级为 `partial` 或 `failed`。

## tool_review_report

每轮结束后默认都执行一次：

```bash
node scripts/tool_review_report.mjs render
```

或显式指定日志：

```bash
node scripts/tool_review_report.mjs render --log-path "<logPath>"
```

报告至少应包含：

- 结果轴：`pageShellCreated`、`routeReady`、`readbackMatched`、`dataReady`、`runtimeUsable`、`browserValidation`、`dataPreparation`
- 运行摘要：任务、runId、状态、耗时、目标页面信息
- 页面地址：优先输出实际 `pageUrl`
- 工具统计：调用次数、失败次数、跳过次数
- 失败调用：失败工具、错误摘要、关键参数
- Guard 摘要：`audit-payload` 调用次数、blocker/warning、risk-accept
- 时间线：`tool_call`、`note`、`phase`、`gate`
- 可改进点：下次怎样更快达到同样结果

如果日志里没有足够证据，report 可以保守输出：

- `not-recorded`
- `evidence-insufficient`
- `skipped (not requested)`
- `not-run`

## improve 提炼原则

优先提炼 1 到 3 条“能缩短路径”的建议，重点看：

1. 探测是否过晚或过碎
2. 是否存在重复读取 / 连续重复调用
3. 是否有失败后靠猜参数重试
4. 是否可以把相邻写操作压缩进一次 `PostFlowmodels_mutate`
5. 是否缺少可复用的最小成功模板
6. validation 问题能否沉淀回 guard / recipe / reference，而不是停留在一次性口头经验

## 最终汇报规则

最终答复默认至少拆开这些事实：

- `pageShellCreated`
- `routeReady`
- `readbackMatched`
- `dataReady`
- `runtimeUsable`
- `browserValidation`
- `dataPreparation`
- `pageUrl`
- 报告路径和 improve 路径

没有 readback 或 route-ready 时，不要写“已落库完成”或“页面已可打开”。

如果本轮实际搭建了页面，并且日志里存在 `pageUrl`、`adminBase + schemaUid`、或其他可推导地址，最终答复与 review report 都应给出实际页面 URL，方便点击查看；如果拿不到 URL，要明确说明缺的是哪类信息。
