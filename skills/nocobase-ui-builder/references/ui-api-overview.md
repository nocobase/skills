# UI API 概览

这个文档是 `nocobase-ui-builder` 的 API / lifecycle 事实源，覆盖工具映射、请求格式、schema-first 探测、页面生命周期、写入策略与 readback。

日志、phase/gate、review/improve 看 [ops-and-review.md](ops-and-review.md)；block/pattern 细节看 [blocks/index.md](blocks/index.md) 和 [patterns/index.md](patterns/index.md)。

## 1. 先读本地 graph，再读运行时 schema

如果只是要核对某个模型 / slot 结构，优先读：

- [flow-schemas/index.md](flow-schemas/index.md)
- `flow-schemas/manifest.json`
- `flow-schemas/models/<UseName>.json`
- `flow-schemas/catalogs/<OwnerUse>.<slot>.json`

只有以下情况才回退到运行时 schema 工具：

- 本地 graph 缺少目标 `use`
- 本地 graph 与当前实例行为明显冲突
- 当前任务涉及 graph 未覆盖的新模型或新插件结构

`PostFlowmodels_schemabundle` 仍保留给 root block 发现与当前实例结构探测；本地 graph 主要替代常规 `flowModels:schemas` 查阅。

## 2. MCP 工具映射

这些映射是底层事实源，不是默认执行入口。agent 默认应优先走：

- `node scripts/ui_write_wrapper.mjs run --action <create-v2|save|mutate|ensure> ...`
- 或 `rest_validation_builder.mjs` / `rest_template_clone_runner.mjs` 这种已内置 guard/readback 的流水线

只有在实现 wrapper、本地调试底层接口、或核对 HTTP/MCP 参数映射时，才直接参考下面这些工具名。

- `PostDesktoproutes_createv2` -> `POST /desktopRoutes:createV2`
- `PostDesktoproutes_destroyv2` -> `POST /desktopRoutes:destroyV2`
- `PostDesktoproutes_updateorcreate` -> `POST /desktopRoutes:updateOrCreate`
- `GetDesktoproutes_getaccessible` -> `GET /desktopRoutes:getAccessible`
- `GetDesktoproutes_listaccessible` -> `GET /desktopRoutes:listAccessible`
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

调用 MCP 时只用精确工具名，不要传 REST 路径。

默认执行策略：

- 页面创建/模板克隆：优先走 `ui_write_wrapper.mjs --action create-v2` 或 `rest_validation_builder.mjs` / `rest_template_clone_runner.mjs`
- ad-hoc `save` / `mutate` / `ensure`：默认走 `scripts/ui_write_wrapper.mjs`
- 不要在 `js_repl` 或外层 prompt 里直接裸调 `PostDesktoproutes_createv2` / `PostFlowmodels_save` / `PostFlowmodels_mutate` / `PostFlowmodels_ensure`

## 3. 请求格式

query 参数工具暴露成 MCP 顶层参数，例如：

```json
{
  "parentId": "k7n4x9p2q5ra",
  "subKey": "page",
  "includeAsyncNode": true
}
```

请求体工具暴露 `requestBody`，不要再套 `values`：

```json
{
  "requestBody": {
    "uses": ["PageModel", "TableBlockModel"]
  }
}
```

强规则：

- 不要发送 `requestBody: { "values": ... }`
- 原始 HTTP JSON 请求体直接放进 `requestBody`
- NocoBase `resourcer` 会在内部包装到 `ctx.action.params.values`

## 4. schema-first 探测顺序

任何写操作前都遵循下面顺序：

1. 先读本地 graph
2. `PostFlowmodels_schemabundle`
3. 收敛本轮目标 public `use`
4. 用一次 `PostFlowmodels_schemas` 拉齐目标 `use`
5. 中途发现漏掉的 `use` 时，补一次增量 `PostFlowmodels_schemas`
6. 只有仍未消歧时，才调用 `GetFlowmodels_schema`
7. 对当前目标树做一次写前 `GetFlowmodels_findone`

常见 `schemaBundle` 起手式：

```json
{
  "requestBody": {
    "uses": ["PageModel", "FilterFormBlockModel", "TableBlockModel", "DetailsBlockModel", "CreateFormModel", "EditFormModel", "ActionModel"]
  }
}
```

这个 `uses` 列表不是白名单；本轮涉及 tab、popup、关系区块、引用区块或 JS/public blocks 时按任务追加。

## 5. live snapshot 读取节奏

对同一目标 live tree，默认只保留两次 `GetFlowmodels_findone`：

1. 写前一次：当前阶段唯一基线
2. 写后一次：确认结果是否真正落库

只有目标树切换、核对不同子树、服务端返回与 live tree 不一致、或当前在排查失败时，才允许额外读取。不要因为“保险起见”反复读同一个 page/grid。

## 6. 页面初始化生命周期

`PostDesktoproutes_createv2` 用来初始化 Modern page (v2) 页面壳：

但这只是底层接口。默认执行时不要直接裸调，改为通过 `ui_write_wrapper.mjs --action create-v2` 或内建 builder 流水线调用它。

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

`schemaUid` 默认通过 [opaque-uid.md](opaque-uid.md) 的 `reserve-page` 生成，不要手写语义化值。

它会创建或保证以下对象存在：

- page route
- `tabs-{schemaUid}` 隐藏默认 tab route
- 对应 `uiSchemas` FlowRoute 壳
- `{schemaUid} -> page` flow model 根节点
- `tabs-{schemaUid} -> grid` 默认 grid 根节点

关键约束：

- 相同 `schemaUid + title + icon + parentId` 时具备幂等性
- 相同 `schemaUid` 但关键字段不同会返回 `409`
- 它不是修复接口
- 它不代表页面已经可打开
- skill 层默认不允许裸调；应通过 `rest_validation_builder.mjs` / `rest_template_clone_runner.mjs` 这类自带 route-ready/readback 的流水线使用

## 7. route-ready

`createV2` 成功后，至少还要满足其一，才算 route-ready：

- `GetDesktoproutes_getaccessible({ filterByTk: "<schemaUid>" })` 能读到新页面
- `GetDesktoproutes_listaccessible({ tree: true })` 中能看到 page route 和 `tabs-{schemaUid}` 子 route

没有 route-ready 证据时，只能报 `page shell created`，不能报 `ready` 或 `payload already works`。

`PostDesktoproutes_updateorcreate` 只在页面路由本身需要 update-or-create 时使用；它不是 `createV2` 的替代品，也不替代 page/grid anchor 的生命周期检查。

## 8. 读取页面

读取页面根节点：

```json
{
  "parentId": "k7n4x9p2q5ra",
  "subKey": "page",
  "includeAsyncNode": true
}
```

读取默认页签 grid：

```json
{
  "parentId": "tabs-k7n4x9p2q5ra",
  "subKey": "grid",
  "includeAsyncNode": true
}
```

显式 tab 场景下，使用明确的 `tabSchemaUid` 读取对应 `grid`。

## 9. 写入策略与 readback

- agent 默认不要直接决定 `PostFlowmodels_save` / `PostFlowmodels_mutate` / `PostFlowmodels_ensure`；默认由 wrapper 或 builder 流水线代选底层写法。
- 多步事务、`$ref` 串联、可重试 upsert：底层通常落到 `PostFlowmodels_mutate`
- 单个已知模型/树且已有实时快照：底层通常落到 `PostFlowmodels_save`
- object child 缺失且 schema 已证明本应存在：底层才用 `PostFlowmodels_ensure`
- 排序只用 `PostFlowmodels_move`
- 删除已知子树只用 `PostFlowmodels_destroy`
- `PostFlowmodels_duplicate` 是遗留接口；确实需要复制时，优先考虑 `mutate + duplicate`

以下写操作成功后，都必须立刻做同目标 readback：

- `PostFlowmodels_save`
- `PostFlowmodels_ensure`
- `PostFlowmodels_mutate`

skill 级执行约束：

- 上面这些工具不是 ad-hoc 默认入口
- ad-hoc live tree 写入与直接页面壳创建时，统一经 `node scripts/ui_write_wrapper.mjs run ...`
- `flow_write_wrapper.mjs` 只保留给 flow-only 兼容场景，不再是默认 agent 入口
- `mutate` / `ensure` 如果请求体不是最终模型树，要额外提供 verify payload 给兼容 wrapper 做 guard/readback

对账规则：

- 以后续同目标 `GetFlowmodels_findone` 为准
- 默认由 wrapper 自动执行写后 readback；不要手工把它省掉
- `ok` 只代表请求提交成功，不代表最终状态
- 显式 tabs 至少对账 tab 数、tab 标题、每个 tab 是否有 `BlockGridModel`
- selector/dataScope 至少对账 `filterByTk` / `dataScope` 是否漂移

readback mismatch 时，默认降级为 `partial` 或 `failed`。

## 10. 删除页面

使用 `PostDesktoproutes_destroyv2`：

```json
{
  "requestBody": {
    "schemaUid": "k7n4x9p2q5ra"
  }
}
```

可选校验：

- page route 已不存在
- `parentId={schemaUid}, subKey=page` 返回 `null`
- `parentId=tabs-{schemaUid}, subKey=grid` 返回 `null`
