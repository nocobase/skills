---
name: nocobase-ui-builder
description: 通过 MCP 构建和更新 NocoBase Modern page (v2) UI。用户要创建页面，或通过 desktopRoutes v2 与 flowModels MCP 工具修改现有页面区块时使用。
allowed-tools: All MCP tools provided by NocoBase server, plus local Node for scripts/opaque_uid.mjs
---

# 目标

通过 Swagger 生成的 NocoBase MCP 工具，构建和更新 NocoBase Modern page (v2) UI。

本 skill 面向 `~/auto_works/nocobase` 仓库 `feat/improve-ui-apis` 分支当前生成的工具名：

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

V1 范围刻意收窄：

- 使用 `PostDesktoproutes_createv2` / `PostDesktoproutes_destroyv2` 创建或删除 v2 页面壳
- 读取现有页面壳及其默认页签网格（`grid`）
- 在页面网格（`grid`）中新增、更新、移动或删除常见区块
- 当前支持的公共区块模型：`TableBlockModel`、`CreateFormModel`、`EditFormModel`

# 前置条件

1. 确认 NocoBase MCP 已经配置完成且当前可连接。
2. 确认上面列出的工具在当前会话里可见。
3. 如果 MCP 未配置或工具缺失，立即停止，先使用 `../nocobase-mcp-setup/SKILL.md`。
4. 确认本地 Node 可用，以便运行 `scripts/opaque_uid.mjs`。

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

结束本次执行：

- `node scripts/tool_journal.mjs finish-run --log-path "<logPath>" --status success --summary "已完成页面创建与区块写入"`

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

1. 调用 `PostFlowmodels_schemabundle`，参数包含：
   - `PageModel`
   - `TableBlockModel`
   - `CreateFormModel`
   - `EditFormModel`
   - `ActionModel`
2. 对即将修改的精确模型调用 `PostFlowmodels_schemas`
3. 如果目标模型的 JSON Schema 或骨架仍有歧义，再调用 `GetFlowmodels_schema`
4. 每次变更前都用 `GetFlowmodels_findone` 读取线上页面树

用 `schemaBundle` 做紧凑的提示词初始化，用 `schemas` 拉取一批模型文档，用 `schema` 做单模型深挖。只要能探测，就绝不要猜请求体字段键、slot 名或模型 use。

# 公共模型限制

- 只提交从 `PostFlowmodels_schemabundle`、`PostFlowmodels_schemas` 或 `GetFlowmodels_schema` 探测到的公共模型 use
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
- 生成稳定的 opaque 节点 uid：
  - `node scripts/opaque_uid.mjs node-uid --page-schema-uid "k7n4x9p2q5ra" --use "TableBlockModel" --path "block:table:orders:main"`

规则：

- 在 `createV2` 模式下，页面路由的 `schemaUid` 必须来自 `reserve-page`
- 隐藏默认页签路由固定为 `tabs-{schemaUid}`
- 页面根节点和默认 `grid` flow model 的 `uid` 仍由 `createV2` 服务端生成，不要尝试覆盖
- 你创建的每个新区块 / 列 / 表单项 / 动作，都应使用 `node-uid`
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

1. 先读取目标网格（`grid`）
2. 为目标公共区块 use 加载 `schemaBundle` + `schemas`
3. 如果某个字段或子结构仍不清楚，再读取该 use 对应的 `GetFlowmodels_schema`
4. 从探测得到的骨架 / 最小示例出发，只填充用户明确要求的字段
5. 使用 `node scripts/opaque_uid.mjs node-uid ...` 生成新的 opaque uid
6. 使用 `PostFlowmodels_mutate` 创建区块：
   - `requestBody.atomic = true`
   - 使用 `type: "upsert"`
   - 始终显式包含 `uid`，保证重试安全
7. 通过保存 / upsert 的方式把新区块挂到网格上：
   - `parentId={gridUid}`
   - `subKey=items`
   - `subType=array`
8. 重新读取网格，并返回新区块的快照

新区块的 Opaque UID 约定：

- 不要手写 `table-{schemaUid}-{slug}` 这种语义化 id
- 始终用规范逻辑路径调用 `node-uid`
- 如果生成出的 uid 已存在，把任务视为更新/补丁，而不是静默覆盖

## 更新区块

1. 读取目标网格，并通过 `uid` 定位区块
2. 保留当前快照中未知但已存在的字段
3. 只更新该具体区块 use 支持的字段
4. 保持现有区块 `uid` 不变
5. 对新增加的任何子节点，都用 `node-uid` 生成 uid
6. 用相同的 `uid` 通过 `PostFlowmodels_save` 回写；如果更新必须与其他操作保持事务一致，则使用 `PostFlowmodels_mutate`
7. 重新读取区块或网格，并报告变更差异

## 移动区块

1. 读取目标网格，并解析出两个区块 uid
2. 使用 `PostFlowmodels_move`：
   - `sourceId`
   - `targetId`
   - `position=before|after`
3. 重新读取网格，并报告新顺序

## 删除区块

1. 读取目标网格，并确认区块存在
2. 使用 `PostFlowmodels_destroy({ filterByTk: blockUid })` 删除
3. 重新读取网格，确认区块已经消失

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

V1 阶段必须把修改范围控制得很窄：

- `TableBlockModel`：区块壳、表格设置、分页大小、行号显示、排序、数据范围
- `CreateFormModel`：区块壳、表单布局、表单网格壳、动作列表壳
- `EditFormModel`：与创建表单相同，外加表单数据范围

不要自由发挥去生成下面这些仅运行时才稳定的任意嵌套子节点：

- `BlockGridModel.subModels.items`
- 表格列
- 表单网格字段项

如果 `schemaBundle` 或 `schema` 把某个子树标记为 `dynamicHints` / 未解析的运行时提示，那么就停在稳定壳层；除非当前实时快照已经包含完全相同的子树，且用户要的修改是局部且显然的。

# 现有页面修改规则

V1 可以修改现有页面，但必须严格控制范围：

- 每次变更前都先读取
- 优先追加或定点补丁，不要重建
- 不要为了一个局部改动替换整棵页面树
- 不要凭空发明显式可见页签结构；除非用户明确提供 `tabSchemaUid`，否则默认使用隐藏默认页签

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
