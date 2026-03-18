---
name: nocobase-ui-builder
description: 通过 MCP 构建和更新 NocoBase Modern page (v2) UI。用户要创建页面，或通过 desktopRoutes v2 与 flowModels MCP 工具修改现有页面区块时使用。
allowed-tools: All MCP tools provided by NocoBase server, plus local Node for scripts/opaque_uid.mjs, scripts/flow_payload_guard.mjs, scripts/tool_journal.mjs, and scripts/tool_review_report.mjs
---

# 目标

通过 Swagger 生成的 NocoBase MCP 工具，构建和更新 NocoBase Modern page (v2) UI。

本 skill 面向当前会话中已暴露的以下 MCP 工具名：

- `PostDesktoproutes_createv2`
- `PostDesktoproutes_destroyv2`
- `GetFlowmodels_findone`
- `GetFlowmodels_schema`
- `PostFlowmodels_schemas`
- `PostFlowmodels_schemabundle`
- `PostFlowmodels_save`
- `PostFlowmodels_ensure`
- `PostFlowmodels_mutate`
- `PostFlowmodels_move`
- `PostFlowmodels_destroy`
- `PostFlowmodels_attach`
- `PostFlowmodels_duplicate`

只要这些 MCP 工具名可用，就必须原样使用。不要把 `flowModels:schemaBundle` 或 `desktopRoutes:createV2` 当成真正的工具名本身。

V1 默认采用 schema-first 的渐进支持策略：

- 使用 `PostDesktoproutes_createv2` / `PostDesktoproutes_destroyv2` 创建或删除 v2 页面壳
- 读取现有页面壳、页签、网格（`grid`）及相关 live tree
- 在页面网格（`grid`）、页签网格和已解析的 popup/page 子树中新增、更新、移动或删除公共区块
- 默认优先关注的常见公共模型包括：`FilterFormBlockModel`、`TableBlockModel`、`DetailsBlockModel`、`CreateFormModel`、`EditFormModel`、`ActionModel`
- 当 `PostFlowmodels_schemas` / `GetFlowmodels_schema` 已经返回具体子树 schema、allowed uses 或稳定的 `stepParams` 结构时，支持范围自动扩展到已解析的页签结构、字段渲染、关系区块、popup/openView 动作、表单/表格子树等稳定模型
- 实际可写范围始终以当前探测结果为准，不把支持范围硬编码成固定区块白名单

# 前置条件

1. 确认 NocoBase MCP 已经配置完成且当前可连接。
2. 确认上面列出的工具在当前会话里可见。
3. 如果 MCP 未配置，先使用 `../nocobase-mcp-setup/SKILL.md`；如果只是工具缺失，先确认当前服务端实际暴露了对应 MCP/Swagger 工具，再决定是否需要重新接入。
4. 确认本地 Node 可用，以便运行 `scripts/opaque_uid.mjs`、`scripts/flow_payload_guard.mjs`。
5. 默认按真实可用性标准执行：不仅要准备数据模型，还要准备可查询的数据样本；不要把“页面壳创建成功”当成任务完成。

# 区块与模式文档入口

当任务开始进入 block-level 搭建时，推荐按下面路径查阅 references，而不是把所有细节都从 `SKILL.md` 现推导：

1. 先从用户目标识别本轮涉及的区块 use 与横切场景
   - 例如：筛选区块、主表、详情区块、创建/编辑表单、page/tabs
   - 以及：表格列渲染、popup/openView、关系上下文、record actions、tree table、多对多/中间表
2. 先打开 [references/blocks/index.md](references/blocks/index.md)
3. 对每个目标区块，再打开对应 block 文档
4. 然后按 block 文档里的“关联模式文档”继续打开 `references/patterns/*.md`
5. 如果索引里还没有对应文档，退回本 skill 的通用 `schema-first` 规则继续执行，并在日志里追加 `note` 说明当前缺少专用文档

这条路径是推荐入口，不是强制 gate；但以下场景优先走这条路径：

- 需要验证真实可用性
- 复杂页面或多个区块并存
- popup/openView 或嵌套 drawer/dialog
- 关系区块、关系上下文、多对多/中间表
- 显式 tabs、多 tab 页面
- 树表、自关联、record action

# 执行日志

这个 skill 应该为每次执行生成一份独立的工具调用日志，方便事后复盘。这里的“日志”是 skill 级 best-effort 记录，不是平台底层自动拦截，所以必须严格按下面流程执行。

- 默认日志目录：`~/.codex/state/nocobase-ui-builder/tool-logs`
- 最近一次运行清单：`~/.codex/state/nocobase-ui-builder/latest-run.json`
- 日志格式：每次执行一个独立的 `.jsonl` 文件，每行一个 JSON 事件

开始任何探测或写操作之前，先初始化本次运行日志：

- `node scripts/tool_journal.mjs start-run --task "<用户请求>" [--title "<title>"] [--schemaUid "<schemaUid>"]`

规则：

1. 保存 `start-run` 返回的 `logPath`，整个 skill 执行期间都复用它。
2. 每次调用 MCP 工具后，都立即追加一条 `tool_call` 记录；如果调用失败，也必须记录，`status=error`。
3. 每次调用本 skill 的本地辅助脚本后，也要追加一条 `tool_call` 记录，`toolType=node`。
4. 在关键阶段之间可以追加 `note` 记录，说明当前判断、分支原因或发现的问题。
5. 在最终答复用户之前，必须写入 `run_finished` 记录。

记录工具调用示例：

- 成功：
  - `node scripts/tool_journal.mjs tool-call --log-path "<logPath>" --tool "PostFlowmodels_mutate" --tool-type mcp --args-json '{"requestBody":{"atomic":true}}' --status ok --summary "创建表格区块"`
- 失败：
  - `node scripts/tool_journal.mjs tool-call --log-path "<logPath>" --tool "GetFlowmodels_schema" --tool-type mcp --args-json '{"use":"TableBlockModel"}' --status error --error "unsupported-model-use"`

记录阶段说明示例：

- `node scripts/tool_journal.mjs note --log-path "<logPath>" --message "schemaBundle 已读取，准备进入 schemas 精确探测"`
- `node scripts/tool_journal.mjs note --log-path "<logPath>" --message "risk-accept for EMPTY_POPUP_GRID" --data-json '{"type":"risk_accept","codes":["EMPTY_POPUP_GRID"],"reason":"temporary shell allowed during migration"}'`

结束本次执行：

- `node scripts/tool_journal.mjs finish-run --log-path "<logPath>" --status success --summary "已完成页面创建与区块写入"`

# 复盘报告与自动改进

每次这个 skill 执行完后，都应该自动进入复盘与改进步骤，不需要等用户额外要求。目标不是写长报告，而是快速找出“下一次怎样更直接、更少步骤地完成同样结果”。

- 默认报告目录：`~/.codex/state/nocobase-ui-builder/reports`
- 默认输入来源：最近一次运行清单 `~/.codex/state/nocobase-ui-builder/latest-run.json`
- 默认输出：
  - 一份 Markdown 复盘报告
  - 一份单文件 HTML 复盘报告
  - 一份 `*.improve.md`
  - 一份 `*.improve.json`
  - 一份长期累积的 `~/.codex/state/nocobase-ui-builder/improvement-log.jsonl`

常用命令：

- 基于最近一次运行生成双份报告：
  - `node scripts/tool_review_report.mjs render`
- 基于指定日志生成双份报告：
  - `node scripts/tool_review_report.mjs render --log-path "<logPath>"`
- 只生成 Markdown：
  - `node scripts/tool_review_report.mjs render --log-path "<logPath>" --formats md`
- 指定输出目录：
  - `node scripts/tool_review_report.mjs render --log-path "<logPath>" --out-dir "<dir>"`
- 指定长期优化日志路径：
  - `node scripts/tool_review_report.mjs render --log-path "<logPath>" --improvement-log-path "<file>"`

报告内容至少应包含：

1. 运行摘要：任务、runId、状态、耗时、目标页面信息
2. 工具统计：各工具调用次数、失败次数、跳过次数
3. 失败调用：失败工具、摘要、错误信息、关键参数
4. Guard 摘要：`flow_payload_guard.audit-payload` 调用次数、blocker/warning 总数、risk-accept 次数、是否出现“带 blocker 继续写入”
5. 时间线：按顺序列出 `tool_call` 与 `note`
6. 可改进点：基于日志自动给出的流程优化提示

自动改进步骤要求：

1. 每次执行结束，先写入 `run_finished`。
2. 然后立刻执行一次 `tool_review_report.mjs render`。
3. 优先查看生成的 `*.improve.md`，提炼最值得下次提速的 1 到 3 条。
4. 如果本次任务以分析、复盘或流程改进为主，最终答复用户时应给出报告路径和最关键的提速建议。

自动改进关注点应偏向“更快达到同样效果”，优先检查：

1. 探测是否过晚，能否前置并批量化
2. 是否存在重复读取或连续重复调用
3. 是否有失败后靠猜参数重试的行为
4. 是否可以把相邻写操作压缩进一次 `PostFlowmodels_mutate`
5. 是否缺少可复用的最小成功模板
6. 是否过早依赖样板页，而不是优先消化 `schemaBundle` / `schemas`

# Payload 守卫

任何落库前都要先经过本地 payload 守卫。Prompt 只负责模式选择，脚本负责阻断高风险 payload。

本 skill 使用 `scripts/flow_payload_guard.mjs` 提供 3 个命令：

- `build-filter`
  - 生成唯一允许的 relation/dataScope condition 形状：`{ path, operator, value }`
- `extract-required-metadata`
  - 从 draft payload 中提取 collection / field / popup context 校验所需的元数据需求
- `audit-payload`
  - 在写入前审计 draft payload，输出 `blockers` / `warnings`

强制规则：

1. 不允许手写 `dataScope.filter.items[*] = { field, operator, value }`
2. 不允许把 `foreignKey` 直接当成 `fieldPath`
3. popup/openView 动作如果要落库，至少要有 `action + openView + page + tab + grid + business block`
4. popup 子树如果依赖 `{{ctx.view.inputArgs.filterByTk}}`，动作层必须显式传 `filterByTk`
5. popup / 详情里的“当前记录关联子表”只有在 parent->child relation resource 已被稳定 reference、live tree 或样板页证实时，才优先使用 `resourceSettings.init.associationName + sourceId`；未证实前允许保留 child-side 的逻辑 `dataScope.filter`
6. `associationName` 不能只凭子表上指向父表的 `belongsTo` 字段名猜；裸字段名和 `childCollection.belongsToField` 这种全限定写法都算未验证协议，如果没有稳定 reference 或 live tree 证明可用，默认保持 blocker
7. `DetailsBlockModel` 不能只落空 grid；至少要有详情字段、动作或子业务区块之一
8. 关联字段不能默认直接写成 `DisplayTextFieldModel(fieldPath=<relationField>)`；表格/详情要展示目标标题字段时，优先保留父 collection，并使用完整 dotted path，例如 `customer.name`
9. 默认使用 `--mode validation-case` 作为严格写前审计模式；`--mode general` 只用于调试或检查未完成草稿，不能替代最终落库 gate
10. 如果上层任务显式要求某个动作能力或交互结果，例如“某个 collection 的表格必须有编辑对话框”，要通过 `audit-payload --requirements-json/--requirements-file` 把要求声明给 guard；`requiredActions` 需要同时覆盖 block 级 `actions` 和 `TableActionsColumnModel` 里的记录动作
11. 用户显式要求“多个可见 tabs”时，要把 tabs 标题要求通过 `requirements.requiredTabs` 声明给 guard；仅有默认隐藏 tab 或只有 page 壳，不能算成功
12. `PostFlowmodels_save` / `PostFlowmodels_mutate` 返回 ok 只代表“请求提交成功”；最终状态必须以后续 `GetFlowmodels_findone` 的 write-after-read 结果为准
13. through / 多对多中间表的 popup add/edit 动作，若尚未做浏览器 smoke，只能写成“模型树已落库，运行时未实测”，不能直接报“动作可用”

命令示例：

```bash
node scripts/flow_payload_guard.mjs build-filter \
  --path order \
  --operator '$eq' \
  --value-json '"{{ctx.view.inputArgs.filterByTk}}"'
```

```bash
node scripts/flow_payload_guard.mjs extract-required-metadata \
  --payload-json '<draft-payload-json>'
```

```bash
node scripts/flow_payload_guard.mjs audit-payload \
  --payload-json '<draft-payload-json>' \
  --metadata-json '<normalized-metadata-json>' \
  --mode validation-case \
  --requirements-json '{"requiredActions":[{"kind":"edit-record-popup","collectionName":"order_items"}]}'
```

`audit-payload` 返回 blocker 时，默认立即停止写入。只有确实需要保留风险时，才允许追加一条 `risk_accept` note，并重新运行一次 `audit-payload`：

- `node scripts/tool_journal.mjs note --log-path "<logPath>" --message "risk-accept for EMPTY_POPUP_GRID" --data-json '{"type":"risk_accept","codes":["EMPTY_POPUP_GRID"],"reason":"temporary shell allowed during migration"}'`
- `node scripts/flow_payload_guard.mjs audit-payload --payload-json '<draft-payload-json>' --metadata-json '<normalized-metadata-json>' --mode validation-case --risk-accept EMPTY_POPUP_GRID`

以下 code 不允许通过 `risk_accept` 降级，哪怕在 note 里显式列出也必须继续保持 blocker：

- `ASSOCIATION_CONTEXT_REQUIRES_VERIFIED_RESOURCE`
- `ASSOCIATION_FIELD_REQUIRES_EXPLICIT_DISPLAY_MODEL`
- `ASSOCIATION_SPLIT_DISPLAY_BINDING_UNSTABLE`
- `EMPTY_DETAILS_BLOCK`

不要用自然语言口头说明代替 `risk_accept` note；复盘脚本只认结构化 note。
如果同一个 draft 里同一个 blocker code 同时命中多个位置，当前 `--risk-accept <CODE>` 不会做模糊降级；先拆小 payload 或先修结构，再重新审计。

请求参数规则：

- 如果工具暴露了 `requestBody`，就把原始 HTTP JSON 请求体直接放进 `requestBody`。
- 不要在 `requestBody` 里额外再套一层 `values`。
- 对 `GetFlowmodels_findone`、`PostFlowmodels_move`、`PostFlowmodels_destroy`、`PostFlowmodels_attach` 这类纯查询/顶层参数工具，直接传顶层工具参数。

NocoBase `resourcer` 的关键实现细节：

- MCP 实际 POST 到 `/desktopRoutes:createV2`、`/flowModels:save`、`/flowModels:mutate` 等接口。
- NocoBase 内部会把原始 POST 请求体包装到 `ctx.action.params.values`。
- 所以 MCP 应发送 `requestBody: { schemaUid, title, ... }`，而不是 `requestBody: { values: { ... } }`。

# 强制探测顺序

任何写操作之前都必须遵循下面的顺序：

1. 调用 `PostFlowmodels_schemabundle`，参数至少包含：
   - `PageModel`
   - `FilterFormBlockModel`
   - `TableBlockModel`
   - `DetailsBlockModel`
   - `CreateFormModel`
   - `EditFormModel`
   - `ActionModel`
   - 以及本次任务明确涉及的其他目标公共模型 use
2. 先收敛“本轮即将修改的目标 public model use 列表”，优先用一次 `PostFlowmodels_schemas` 拉齐这一批精确模型文档
3. 如果在构造过程中新增了目标 use，先补一次增量 `PostFlowmodels_schemas`，不要直接跳到多个 `GetFlowmodels_schema`
4. 如果目标模型的 JSON Schema 或骨架仍有歧义，再对仍未消歧的具体 use 调用 `GetFlowmodels_schema`
5. 每次变更前都用 `GetFlowmodels_findone` 读取线上页面树，作为该目标树本轮唯一的写前 live snapshot
6. 在本地组装 draft payload；如果有 relation/dataScope condition，必须先用 `flow_payload_guard.mjs build-filter` 生成 condition 片段
7. 用 `flow_payload_guard.mjs extract-required-metadata` 提取本轮 draft payload 依赖的元数据需求
8. 通过当前会话可见的 collection / field MCP 工具补齐元数据，并整理成 `metadata-json`
9. 运行 `flow_payload_guard.mjs audit-payload`
10. 只有 `audit-payload` 没有 blocker，或已经通过结构化 `risk_accept` note 明确豁免后，才允许 `PostFlowmodels_save` / `PostFlowmodels_mutate`
11. 每次写入后立刻执行一次同目标 `GetFlowmodels_findone` 做 write-after-read 对账；如果 readback 与 write 预期不一致，立即降级为 `partial/failed`，不要继续沿用 save 的乐观结论

用 `schemaBundle` 做紧凑的提示词初始化，用 `schemas` 拉取一批模型文档，用 `schema` 做单模型深挖。只要能探测，就绝不要猜请求体字段键、slot 名或模型 use。

补充执行规则：

- 同一写入阶段里，默认先把目标 use 尽量合并进一次 `PostFlowmodels_schemas`；不要把多个目标 use 分散成多次单模型深挖。
- `GetFlowmodels_schema` 只用于 `schemas` 之后仍未消歧的具体 use；如果同一 use 需要再次读取，必须是为了核对不同 slot 形状、服务端返回前后不一致、或排查失败，并在日志里追加 `note` 说明原因。
- 如果只是中途发现漏了一个目标 use，先补增量 `PostFlowmodels_schemas`，不要因为“怕漏掉”就连续追加多个 `GetFlowmodels_schema`。
- 默认使用 `flow_payload_guard.mjs audit-payload --mode validation-case`；`--mode general` 仅用于调试或分析中间 draft，不能代替最终写前审计
- `flow_payload_guard.audit-payload` 的结果必须记录到 tool journal；推荐把 `tool` 名写成 `flow_payload_guard.audit-payload`
- 显式 tabs 场景至少对账：tab 数、tab 标题、每个 tab 是否有 `BlockGridModel`
- `run_finished`、tool review 和最终答复都必须引用 write-after-read 事实；不能在 readback 为空时继续写“已落库完成”
- 出现 blocker 时，不允许绕过 guard 直接写入；如果确实要保留风险，必须先写 `risk_accept` note，再重新审计一次

# Live Snapshot 读取节奏

对同一目标 live tree（同一个 page / grid / popup page 子树），默认只保留两次 `GetFlowmodels_findone`：

1. 写前一次：拿最新快照作为本轮唯一基线
2. 写后一次：确认结果已落库

只有在以下情况，才允许对同一目标额外读取：

- 目标父节点或目标树已经切换
- 需要核对另一个不同子树，而不是同一个 grid/page
- 服务端写入返回和 live tree 明显不一致
- 当前是在排查失败、冲突或异常回写

出现额外读取时，必须在日志里追加 `note`，写明为什么默认“两次节奏”不足。不要为了“保险起见”连续重复读取同一个 grid/page；如果只是新增了目标 use，先补 `PostFlowmodels_schemas`，不要先多读 live tree。

# Schema-First 判定规则

默认策略是 `schemaBundle` / `schemas` / `schema` 优先，样板页只作为 fallback。

1. 如果 `PostFlowmodels_schemas` 或 `GetFlowmodels_schema` 已经为目标 slot 返回了具体子模型 schema、allowed uses、`stepParams` 结构，那么直接按 schema 构造合法 flow model 树。
2. `dynamicHints` 不是自动阻断信号；只有当目标 slot 仍停留在泛型节点、未展开的 `genericModelNodeSchema`、或只有“运行时决定”提示而没有可落库的具体 schema 时，才把它视为未解析。
3. 只有在以下情况，才允许读取样板页：
   - schema 文档仍不足以确定目标子树
   - schema 文档和当前实例实际 live tree 形状明显不一致
   - 当前实例有插件扩展，导致你需要同实例成功样本来确认最小 payload
4. 读取样板页时必须在日志里追加 `note`，写明为什么 schema-first 不足。
5. 默认每种区块类型最多读取一个样板页；如果第一个样板不足，再明确记录不足点后再读第二个。

# 公共模型限制

- 只提交从 `PostFlowmodels_schemabundle`、`PostFlowmodels_schemas` 或 `GetFlowmodels_schema` 探测到的公共模型 use
- 公共模型 use 不是固定白名单；只要当前 schema 文档明确公开、允许且可落库，就可以使用
- 拒绝 `FormBlockModel` 这类内部模型或禁止直接使用的模型
- 如果服务端返回 `unsupported-model-use` 或 schema 校验错误，立即停止，并明确说明具体的 model/use 不匹配点

# 页面初始化与锚点

`PostDesktoproutes_createv2` 只负责初始化页面壳，会创建：

- 带有 `schemaUid` 的页面路由
- `schemaUid = tabs-{schemaUid}` 的隐藏默认页签路由
- 绑定到 `schemaUid` 的 `uiSchemas` FlowRoute 壳
- 挂在 `schemaUid -> page` 下的 flow model 根节点
- 挂在 `tabs-{schemaUid} -> grid` 下的 flow model 根节点

它不是修复接口。如果页面已经存在：

- 相同 `schemaUid` 且关键字段一致，会返回现有页面
- 相同 `schemaUid` 但 `title` / `icon` / `parentId` 不同，会返回 `409`
- 它不会补齐缺失的 `uiSchemas` 或 `flowModels`

# Opaque UID 辅助脚本

本 skill 使用本地辅助脚本 `scripts/opaque_uid.mjs` 生成 opaque 标识，避免依赖 NocoBase 源码内部实现。

- 默认注册表路径：`~/.codex/state/nocobase-ui-builder/pages.v1.json`
- 可通过以下方式覆盖注册表路径：
  - `--registry-path <path>`
  - 或环境变量 `NOCOBASE_UI_BUILDER_REGISTRY_PATH`
- 该脚本返回 JSON；直接读取返回字段，不要自行猜测 ID

命令示例：

- 预留页面路由 `schemaUid`：
  - `node scripts/opaque_uid.mjs reserve-page --title "Orders"`
- 从本地注册表解析已有页面：
  - `node scripts/opaque_uid.mjs resolve-page --title "Orders"`
  - `node scripts/opaque_uid.mjs resolve-page --schemaUid "k7n4x9p2q5ra"`
- 页面标题变更后，同步重命名本地注册表记录：
  - `node scripts/opaque_uid.mjs rename-page --schemaUid "k7n4x9p2q5ra" --title "Orders Admin"`
- 批量生成稳定的 opaque 节点 uid：
  - `node scripts/opaque_uid.mjs node-uids --page-schema-uid "k7n4x9p2q5ra" --specs-json '[{"key":"ordersTable","use":"TableBlockModel","path":"block:table:orders:main"},{"key":"ordersCreateForm","use":"CreateFormModel","path":"block:create-form:orders:main"}]'`

规则：

- 在 `createV2` 模式下，页面路由的 `schemaUid` 必须来自 `reserve-page`
- 隐藏默认页签路由固定为 `tabs-{schemaUid}`
- 页面根节点和默认 `grid` flow model 的 `uid` 仍由 `createV2` 服务端生成，不要尝试覆盖
- 你创建的每个新区块 / 列 / 表单项 / 动作，都应通过 `node-uids` 批量生成
- 即使这次只需要一个 uid，也统一传单元素数组给 `node-uids`
- 必须使用规范逻辑路径；不要从自然语言描述里临时拼接节点路径
- 如果本地注册表缺失且用户没有提供 `schemaUid`，立即停止并向用户索取 `schemaUid`

规范逻辑路径模式：

- 区块壳：
  - `block:table:{collection}:{slot}`
  - `block:create-form:{collection}:{slot}`
  - `block:edit-form:{collection}:{slot}`
- 表格子节点：
  - `block:table:{collection}:{slot}:column:{field}`
  - `block:table:{collection}:{slot}:action:{action}`
- 新建表单子节点：
  - `block:create-form:{collection}:{slot}:grid`
  - `block:create-form:{collection}:{slot}:item:{field}`
  - `block:create-form:{collection}:{slot}:action:{action}`
- 编辑表单子节点：
  - `block:edit-form:{collection}:{slot}:grid`
  - `block:edit-form:{collection}:{slot}:item:{field}`
  - `block:edit-form:{collection}:{slot}:action:{action}`

# 工具选择规则

- `PostFlowmodels_mutate`：事务性多步写入、`$ref` 串联、或需要可重试安全 upsert 时的默认选择
- `PostFlowmodels_save`：读取到已知实时快照后，保存单个已知模型/树结构的默认选择
- `PostFlowmodels_ensure`：仅在必需的 object 子节点缺失，且探测结果证明它本该存在时使用
- `PostFlowmodels_attach`：把现有子树挂到新父节点下时使用
- `PostFlowmodels_duplicate`：遗留的非确定性复制接口，不是 V1 默认路径

如果确实需要复制，优先使用 `PostFlowmodels_mutate`，在 mutation 请求体中显式传入 `type: duplicate` 和 `targetUid`。

# 任务剧本

## 创建页面

1. 确认 `title`，以及可选的 `parentId` / `icon`
2. 运行辅助脚本：
   - `node scripts/opaque_uid.mjs reserve-page --title "<title>"`
3. 读取返回的 `schemaUid`
4. 调用 `PostDesktoproutes_createv2`：
   - `requestBody: { schemaUid, title, parentId, icon }`
5. 读取页面根节点：
   - `GetFlowmodels_findone({ parentId: schemaUid, subKey: "page", includeAsyncNode: true })`
6. 读取默认页签网格：
   - `GetFlowmodels_findone({ parentId: "tabs-{schemaUid}", subKey: "grid", includeAsyncNode: true })`
7. 返回已创建页面的信息，以及解析出的根节点/网格 uid

## 读取页面

1. 解析 `schemaUid`
   - 如果用户只提供了标题，运行：
     - `node scripts/opaque_uid.mjs resolve-page --title "<title>"`
   - 如果用户已经提供 `schemaUid`，直接使用
2. 用 `parentId={schemaUid}, subKey=page` 读取页面根节点
3. 读取目标网格：
   - 默认：`parentId=tabs-{schemaUid}, subKey=grid`
   - 显式页签：`parentId={tabSchemaUid}, subKey=grid`
4. 按 `uid`、`use` 和关键步骤参数总结当前区块

## 新增区块

1. 先收敛本轮目标公共区块 use，并加载 `schemaBundle` + `schemas`
2. 如果中途新增了目标 use，先补一次增量 `PostFlowmodels_schemas`
3. 如果某个字段或子结构仍不清楚，再读取该 use 对应的 `GetFlowmodels_schema`
4. 读取目标网格（`grid`），作为本轮默认唯一的写前 live snapshot
5. 从探测得到的骨架 / 最小示例出发，只填充用户明确要求的字段
6. 先判断目标子树是否已被 `schemas` / `schema` 明确展开：
   - 已明确展开：直接构造区块壳与稳定子树
   - 仍未解析：先退回稳定壳层，或按上面的 fallback 规则读取一个样板页
7. 使用 `node scripts/opaque_uid.mjs node-uids ...` 一次生成本次写入所需的全部 opaque uid
8. 使用 `PostFlowmodels_mutate` 创建区块：
   - `requestBody.atomic = true`
   - 使用 `type: "upsert"`
   - 始终显式包含 `uid`，保证重试安全
9. 通过保存 / upsert 的方式把新区块挂到网格上：
   - `parentId={gridUid}`
   - `subKey=items`
   - `subType=array`
10. 重新读取目标网格，作为本轮默认唯一的写后 live snapshot，并返回新区块的快照

新区块的 Opaque UID 约定：

- 不要手写 `table-{schemaUid}-{slug}` 这种语义化 id
- 始终用规范逻辑路径调用 `node-uids`
- 如果生成出的 uid 已存在，把任务视为更新/补丁，而不是静默覆盖

## 更新区块

1. 读取目标网格或目标区块，并通过 `uid` 定位区块；这次读取就是本轮默认唯一的写前 live snapshot
2. 保留当前快照中未知但已存在的字段
3. 只更新该具体区块 use 支持的字段
4. 保持现有区块 `uid` 不变
5. 对新增加的任何子节点，都通过 `node-uids` 批量生成 uid
6. 用相同的 `uid` 通过 `PostFlowmodels_save` 回写；如果更新必须与其他操作保持事务一致，则使用 `PostFlowmodels_mutate`
7. 重新读取同一目标一次，作为本轮默认唯一的写后 live snapshot，并报告变更差异
8. 如果因为切换父节点、核对不同子树、或排查失败需要额外读取，先在日志里追加 `note`

## 移动区块

1. 读取目标网格，并解析出两个区块 uid；这次读取就是本轮默认唯一的写前 live snapshot
2. 使用 `PostFlowmodels_move`：
   - `sourceId`
   - `targetId`
   - `position=before|after`
3. 重新读取同一目标网格一次，作为本轮默认唯一的写后 live snapshot，并报告新顺序

## 删除区块

1. 读取目标网格，并确认区块存在；这次读取就是本轮默认唯一的写前 live snapshot
2. 使用 `PostFlowmodels_destroy({ filterByTk: blockUid })` 删除
3. 重新读取同一目标网格一次，作为本轮默认唯一的写后 live snapshot，确认区块已经消失

## 删除页面

1. 确认页面 `schemaUid`
   - 如果只有标题，先从本地注册表解析
2. 调用 `PostDesktoproutes_destroyv2`：
   - `requestBody: { schemaUid }`
3. 可选校验：
   - 页面路由已不存在
   - 页面根节点的 `GetFlowmodels_findone` 返回 `null`
   - 默认页签网格的 `GetFlowmodels_findone` 返回 `null`

# 支持的区块范围

V1 的边界不再由固定区块白名单决定，而由 schema-first 探测结果决定：

- 页面骨架与页签层：`RootPageModel`、`PageModel`、`RootPageTabModel` / `PageTabModel`、`BlockGridModel` 等页面 / tab anchor 相关模型，可按当前 live tree 与 schema 做创建、读取和补丁
- 常见公共区块：`FilterFormBlockModel`、`TableBlockModel`、`DetailsBlockModel`、`CreateFormModel`、`EditFormModel`
- 常见动作与交互：`ActionModel` 及当前 `schemas` / `schema` 已明确展开的 record actions、popup/openView 相关动作树
- 当当前 `schemas` / `schema` 已明确展开目标 slot 时，也允许直接创建这些稳定子树：
  - `FormGridModel`
  - `FormItemModel`
  - `FormSubmitActionModel`
  - `TableColumnModel`
  - 已在 schema 中明确列出的字段渲染模型
  - 已在 schema 中明确列出的详情字段项、关系区块、popup page / tab 子树
- 实际可写范围始终以当前探测到的 `allowed uses`、具体 child schema 和 live tree 为准，不把支持范围硬编码成固定白名单

不要自由发挥去生成下面这些“当前 schema 文档尚未展开、或 live tree 尚未确认”的运行时子节点或内部模型：

- 未在当前 `schemas` / `schema` 中展开、且未在 `allowed uses` 中出现的 `BlockGridModel.subModels.items`
- 未在当前 `schemas` / `schema` 中展开的表格列子树
- 未在当前 `schemas` / `schema` 中展开的表单网格字段项
- 未在当前 `schemas` / `schema` 中展开的字段渲染子树
- 任何已被标记为内部模型、禁止直接提交的 model use

如果 `dynamicHints` 已经被更具体的 `jsonSchema`、slot schema、allowed uses 覆盖，就按更具体的 schema 执行；只有在目标子树仍未解析时，才停在稳定壳层或读取样板页。

# 现有页面修改规则

V1 可以修改现有页面，但必须严格控制范围：

- 每次变更前都先读取
- 优先追加或定点补丁，不要重建
- 不要为了一个局部改动替换整棵页面树
- 不要凭空发明显式可见页签结构；除非用户明确提供 `tabSchemaUid`，否则默认使用隐藏默认页签
- 除非触发 `Schema-First 判定规则` 里的 fallback 条件，否则不要先去找样板页

# 默认严格模式

这个 skill 默认按真实可用性标准执行。无论是在跑 `references/validation-cases/` 里的用例，还是在做实际页面交付，都遵循下面的规则：

1. 页面搭出来不等于任务完成，还必须验证页面在存在业务数据时是否真的可用。
2. 执行顺序必须是：
   - 先校验或创建前置数据模型
   - 再准备前置模拟数据
   - 再开始页面与区块写入
3. 前置数据准备是默认步骤，不要把它写成依赖某个单独 skill 的特殊前置条件。
4. 造数完成后，必须先做一次最小校验，确认主表和关键关系表都已经有数据，再进入 UI 搭建。
5. 最终结果必须把“数据准备结果”和“UI 搭建结果”分开说明；如果页面建好了但数据没准备好，本次任务不能算完整通过。
6. 具体造数基线、降级策略和输出要求见：
   - [references/validation-data-preconditions.md](references/validation-data-preconditions.md)

# 安全规则

- 同一个页面初始化流程里，绝不要把旧版 `desktopRoutes:create` 和 `PostDesktoproutes_createv2` 混用
- 绝不要把 `PostDesktoproutes_createv2` 当修复接口使用
- 绝不要提交实时探测已标记为内部或未解析的模型 use
- 如果区块请求体没通过 schema 校验，报告结构化错误，不要靠猜 key 反复重试
- 每次写入后都重新读取受影响模型
- 本地页面注册表缺失时，绝不要靠猜 NocoBase 标题自动恢复；直接向用户索取 `schemaUid`
- 不要为了让 uid 看起来更“漂亮”就重命名现有节点；一旦创建，必须保留现有 `uid`

# 参考资料

- API 生命周期、MCP 请求格式、路由/锚点映射、页面初始化规则：
  [references/ui-api-overview.md](references/ui-api-overview.md)
- 具体区块请求体配方与 MCP 调用模式：
  [references/flow-model-recipes.md](references/flow-model-recipes.md)
- 区块文档索引：
  [references/blocks/index.md](references/blocks/index.md)
- 横切模式文档索引：
  [references/patterns/index.md](references/patterns/index.md)
- validation 时的数据前置要求与造数基线：
  [references/validation-data-preconditions.md](references/validation-data-preconditions.md)
- validation 用例目录：
  [references/validation-cases/index.md](references/validation-cases/index.md)
