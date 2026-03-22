# UI API 概览

本 reference 说明如何通过 Swagger 生成的 MCP 工具构建 NocoBase Modern page (v2) UI。

在按本 reference 执行任何 MCP 调用前，先按 `SKILL.md` 中“执行日志”章节初始化 `tool_journal.mjs`，并在每次工具调用后追加日志记录。任务结束后，默认都要执行一次 `tool_review_report.mjs render`，生成复盘与自动改进产物。

这个文件只覆盖 API 生命周期、请求格式、探测顺序与读写节奏。区块级细节不要继续堆在这里，按下面入口查阅：

- 区块入口：[blocks/index.md](blocks/index.md)
- 横切模式入口：[patterns/index.md](patterns/index.md)

## 1. MCP 工具映射

当前这组 UI API 相关工具名通常为：

- `PostDesktoproutes_createv2` -> `POST /desktopRoutes:createV2`
- `PostDesktoproutes_destroyv2` -> `POST /desktopRoutes:destroyV2`
- `PostDesktoproutes_updateorcreate` -> `POST /desktopRoutes:updateOrCreate`
- `GetFlowmodels_findone` -> `GET /flowModels:findOne`
- `GetFlowmodels_schema` -> `GET /flowModels:schema`
- `PostFlowmodels_schemas` -> `POST /flowModels:schemas`
- `PostFlowmodels_schemabundle` -> `POST /flowModels:schemaBundle`
- `PostFlowmodels_save` -> `POST /flowModels:save`
- `PostFlowmodels_ensure` -> `POST /flowModels:ensure`
- `PostFlowmodels_mutate` -> `POST /flowModels:mutate`
- `PostFlowmodels_move` -> `POST /flowModels:move`
- `PostFlowmodels_destroy` -> `POST /flowModels:destroy`
- `PostFlowmodels_attach` -> `POST /flowModels:attach`
- `PostFlowmodels_duplicate` -> `POST /flowModels:duplicate`

调用 MCP 时要使用精确的工具名，不要传 REST 路径。

如果当前会话里暴露出来的工具名不同，以实际 MCP 工具列表为准，但不要把 REST 路径直接当成工具名调用。

## 2. 请求格式规则

使用 query 参数的工具，会暴露为 MCP 顶层参数：

```json
{
  "parentId": "k7n4x9p2q5ra",
  "subKey": "page",
  "includeAsyncNode": true
}
```

使用请求体的工具，会暴露一个 `requestBody` 字段：

```json
{
  "requestBody": {
    "uses": ["PageModel", "TableBlockModel"]
  }
}
```

关键点：

- 不要发送 `requestBody: { "values": ... }`
- 要把原始 HTTP JSON 请求体直接放进 `requestBody`
- NocoBase `resourcer` 会在内部把该 POST 请求体包装到 `ctx.action.params.values`

## 3. 先探测，再写入

任何写操作之前，都按以下顺序读取探测文档：

1. `PostFlowmodels_schemabundle`
2. 如果目标 `use` 已知，先查 [flow-schemas/index.md](flow-schemas/index.md) 与本地 `models/<UseName>.json`
3. 如果要看某个 `subModels.<slot>` 的候选 use，再补读 `catalogs/<OwnerUse>.<slot>.json`
4. 只有本地 graph 缺少目标 `use`、或本地 schema 与当前实例行为明显冲突时，才补 `PostFlowmodels_schemas`
5. 如果中途新增了目标 use，且本地 graph 里仍没有，再补一次增量 `PostFlowmodels_schemas`
6. 如果某个具体模型仍需进一步确认，再调用 `GetFlowmodels_schema`
7. 用 `GetFlowmodels_findone` 读取当前页面 / 网格的实时快照，作为本轮默认唯一的写前 snapshot

推荐的 `schemaBundle` 请求起点：

```json
{
  "requestBody": {
    "uses": [
      "PageModel",
      "FilterFormBlockModel",
      "TableBlockModel",
      "DetailsBlockModel",
      "CreateFormModel",
      "EditFormModel",
      "ActionModel"
    ]
  }
}
```

这个 `uses` 列表是常见起点，不是固定白名单。本次任务如果还涉及 tab、popup、关系区块、引用区块或其他公共模型，应按任务动态追加。

补充规则：

- 如果只是想看某个具体 `use` 的 `jsonSchema`、`minimalExample`、`skeleton`、`dynamicHints`、`commonPatterns` 或 `stepParams` 结构，默认先读本地 `flow-schemas/models/<UseName>.json`
- `models/<UseName>.json` 只保留 metadata + refs；需要具体结构时，再按里面的 `artifactRef` 继续读 `artifacts/`
- 如果要按某条模型路径继续下钻，优先用 `node scripts/flow_schema_graph.mjs hydrate-branch --graph-dir references/flow-schemas --root-use <UseName> --path <slot/use/...>`，而不是一次性把多个 artifact 展开到会话里
- 同一写入阶段里，优先把目标 use 合并进一次 `PostFlowmodels_schemas`；只有发现遗漏 use 时，才补一次增量 `PostFlowmodels_schemas`。
- `GetFlowmodels_schema` 只作为 `schemas` 之后仍未消歧的兜底，不要把多个目标 use 直接拆成多次单模型深挖。
- 对同一目标 live tree，默认只做一次写前 `GetFlowmodels_findone` 和一次写后 `GetFlowmodels_findone`；如果额外读取，必须能说明是目标树切换、校验不同子树、返回不一致，或失败排查。
- 不要为了“保险起见”连续重复读取同一个 grid/page；如果只是目标 use 变多了，先补 `PostFlowmodels_schemas`。
- 不要一次性把 `flow-schemas/artifacts/` 下的多个大 JSON 展开到会话里；默认一轮只读取当前任务相关的单个 `use` 和必要的 1 到 2 个 catalog / artifact

探测结果里重点关注：

- `minimalExample`
- `skeleton`
- `jsonSchema`
- `commonPatterns`
- `dynamicHints`

判定规则：

- 如果 `dynamicHints` 出现，但同一 slot 已经有更具体的 `jsonSchema`、具体 child schema、allowed uses 或最小示例，就按这些更具体的信息构造
- 只有当目标 slot 仍停留在泛型 / 未解析状态时，才不要从零开始凭空构造那个子树
- 默认不要先读样板页；只有当 schema-first 仍不足，或 schema 与当前实例 live tree 明显不一致时，才读取样板页作为 fallback
- 默认保持“写前一次、写后一次”的 live snapshot 节奏；额外读取时要在日志里说明为什么默认节奏不足

如果当前任务已经进入某个具体区块或复杂模式，不要只停留在本总览文档；继续转到：

- 区块文档：[blocks/index.md](blocks/index.md)
- 横切模式文档：[patterns/index.md](patterns/index.md)

## 4. 页面初始化生命周期

用 `PostDesktoproutes_createv2` 创建页面壳：

```json
{
  "requestBody": {
    "schemaUid": "k7n4x9p2q5ra",
    "title": "Orders",
    "parentId": null,
    "icon": "TableOutlined"
  }
}
```

`schemaUid` 可以是 opaque 值。在这个 skill 里，优先通过 `scripts/opaque_uid.mjs reserve-page` 预留，不要手写语义化值。

关键补充：

- `createV2.requestBody.parentId` 是 desktop route id，不是页面 `schemaUid`
- 如果需要把多个 Modern page 放到同一个菜单组，先用 `PostDesktoproutes_updateorcreate` 创建或复用一个 `type=group` 的 desktop route，再把它的 route id 传给 `createV2.parentId`
- `group` 菜单允许通过旧 desktopRoutes 路由接口维护；Modern page 壳本身仍然只能通过 `PostDesktoproutes_createv2`

创建或复用 group 的典型请求：

```json
{
  "filterKeys": ["schemaUid"],
  "requestBody": {
    "type": "group",
    "schemaUid": "g7n4x9p2q5ra",
    "title": "Approval Center",
    "parentId": null
  }
}
```

这个操作会创建或保证以下对象存在：

- 带 `schemaUid` 的页面路由
- `schemaUid = tabs-{schemaUid}` 的隐藏默认页签路由
- `x-component = FlowRoute` 的 `uiSchemas` 根节点
- 挂在父节点 `{schemaUid}` 下、`subKey = page`、`use = RootPageModel` 的 `flowModels` object child
- 挂在父节点 `tabs-{schemaUid}` 下、`subKey = grid`、`use = BlockGridModel` 的 `flowModels` object child

当页面 `schemaUid = k7n4x9p2q5ra` 时：

- 页面路由 schema uid: `k7n4x9p2q5ra`
- 菜单 schema uid: `menu-k7n4x9p2q5ra`
- 默认隐藏页签路由 schema uid: `tabs-k7n4x9p2q5ra`
- 默认隐藏页签 schema name: `tab-k7n4x9p2q5ra`

只有以下关键字段完全一致时，`PostDesktoproutes_createv2` 才具备幂等性：

- `schemaUid`
- `title`
- `icon`
- `parentId`

行为如下：

- 值完全相同：返回现有页面 / defaultTab
- 同一个 `schemaUid` 但值不同：返回 `409`

不要把 `createV2` 当成修复接口。

## 5. 读取页面

读取页面根节点：

```json
{
  "parentId": "k7n4x9p2q5ra",
  "subKey": "page",
  "includeAsyncNode": true
}
```

读取默认页签网格：

```json
{
  "parentId": "tabs-k7n4x9p2q5ra",
  "subKey": "grid",
  "includeAsyncNode": true
}
```

如果是可见页签或自定义页签，就使用明确的 `tabSchemaUid` 去读取对应 `grid`。

## 6. 写入策略

默认写入策略如下：

- 事务性创建 / 更新序列优先使用 `PostFlowmodels_mutate`
- 在保留实时快照的前提下，回写单个已知模型 / 树时优先使用 `PostFlowmodels_save`
- 只有当探测结果表明某个 object child 本应存在但当前缺失时，才使用 `PostFlowmodels_ensure`
- 兄弟节点排序调整只使用 `PostFlowmodels_move`
- 删除单个已知子树 uid 时只使用 `PostFlowmodels_destroy`

`PostFlowmodels_duplicate` 是遗留且非确定性的接口。只有在确实需要复制时，才优先考虑用 `PostFlowmodels_mutate` 配合 `duplicate` 操作和显式 `targetUid`。

## 7. 删除页面

使用 `PostDesktoproutes_destroyv2`：

```json
{
  "requestBody": {
    "schemaUid": "k7n4x9p2q5ra"
  }
}
```

该操作会删除：

- 页面路由及其子路由
- 页面对应的 `uiSchemas` FlowRoute 壳
- 通过 destroy hooks 清理 page 和 default-tab 的 flow model anchors

该接口是幂等的；即便页面已经不存在，也仍会返回 `{ "ok": true }`。
