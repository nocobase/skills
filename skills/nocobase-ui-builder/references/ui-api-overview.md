# UI API 概览

本 reference 说明如何通过 Swagger 生成的 MCP 工具构建 NocoBase Modern page (v2) UI。

## 1. MCP 工具映射

`~/auto_works/nocobase` 仓库 `feat/improve-ui-apis` 分支上的相关工具名：

- `PostDesktoproutes_createv2` -> `POST /desktopRoutes:createV2`
- `PostDesktoproutes_destroyv2` -> `POST /desktopRoutes:destroyV2`
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
2. `PostFlowmodels_schemas`
3. 如果某个具体模型仍需进一步确认，再调用 `GetFlowmodels_schema`
4. 用 `GetFlowmodels_findone` 读取当前页面 / 网格的实时快照

推荐的 `schemaBundle` 请求：

```json
{
  "requestBody": {
    "uses": ["PageModel", "TableBlockModel", "CreateFormModel", "EditFormModel", "ActionModel"]
  }
}
```

探测结果里重点关注：

- `minimalExample`
- `skeleton`
- `jsonSchema`
- `commonPatterns`
- `dynamicHints`

如果 `dynamicHints` 把某个子树标记为仅运行时存在或仍未解析，就不要从零开始凭空构造那个子树。

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
