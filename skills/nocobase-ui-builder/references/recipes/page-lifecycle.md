# 页面生命周期 recipe

适用于创建、读取、删除页面壳，以及确认 page route、hidden tab、page/grid anchor 的生命周期。

## 先读

- [../ui-api-overview.md](../ui-api-overview.md)
- [../opaque-uid.md](../opaque-uid.md)
- [../ops-and-review.md](../ops-and-review.md)

## 默认步骤

1. 先 `start-run`，不要先探测、后补日志。
2. 用 `node scripts/opaque_uid.mjs reserve-page` 生成 opaque `schemaUid`。
3. 创建页面壳时，先直接调用 MCP：`PostDesktoproutes_createv2`、`GetDesktoproutes_listaccessible({ tree: true })`、`GetFlowmodels_findone({ parentId: "<schemaUid>", subKey: "page" })`、`GetFlowmodels_findone({ parentId: "tabs-<schemaUid>", subKey: "grid" })`。
4. 再把这些 artifacts 交给 `ui_write_wrapper.mjs run --action create-v2` 做本地落盘和状态汇总。
5. 后续如果进入区块写入，再按同样的“先 MCP，后 wrapper”流程继续。

## 关键规则

- `createV2` 成功只代表 `pageShellCreated=created`，不代表 `routeReady=ready`。
- 没有 route-ready 证据时，只能汇报 page shell 已创建。
- flowPage v2 的 page 内容必须写 `parentId=<schemaUid>, subKey=page`；不要把 `schemaUid` 直接当作 `RootPageModel.uid`。
- flowPage v2 的显式可见 tabs 不是 page anchor 的 `subModels.tabs`；它们来自 child desktopRoutes，内容分别落在各自 `tabSchemaUid -> grid`。
- 多页面请求先拆成 page-level spec 逐页执行，不要把多个页面混成一个 create 流程。
- 页面删除只用 `PostDesktoproutes_destroyv2`；不要用 flowModels 去“手撕”页面路由。

## 最小可执行示例

创建页面壳时，默认执行入口应是：

```bash
node scripts/ui_write_wrapper.mjs run \
  --action create-v2 \
  --task "create orders page shell" \
  --request-file "<create-v2-request.json>" \
  --schema-uid "k7n4x9p2q5ra" \
  --write-result-file "<create-v2-result.json>" \
  --route-tree-file "<route-tree.json>" \
  --page-anchor-file "<anchor-page.json>" \
  --grid-anchor-file "<anchor-grid.json>" \
  --candidate-page-url "http://127.0.0.1:23000/admin/existing-page"
```

其中 `<create-v2-request.json>` 的底层请求体可以是：

```json
{
  "schemaUid": "k7n4x9p2q5ra",
  "title": "Orders",
  "parentId": null,
  "icon": "TableOutlined"
}
```

## 交付检查

- `pageShellCreated`
- `routeReady`
- page anchor 是否可读
- default hidden tab / grid anchor 是否可读
- 如果继续写区块，再单独汇报 `readbackMatched`
