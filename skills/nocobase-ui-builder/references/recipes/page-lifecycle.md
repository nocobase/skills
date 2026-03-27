# Page lifecycle recipe

## Read first

- [../ui-api-overview.md](../ui-api-overview.md)
- [../opaque-uid.md](../opaque-uid.md)
- [../ops-and-review.md](../ops-and-review.md)

## Default steps

1. Run `start-run` before discovery
2. Generate an opaque `schemaUid` through `node scripts/opaque_uid.mjs reserve-page`
3. For page-shell creation, call MCP first:
   - `PostDesktoproutes_createv2`
   - `GetDesktoproutes_listaccessible({ tree: true })`
   - `GetFlowmodels_findone({ parentId: "<schemaUid>", subKey: "page" })`
   - `GetFlowmodels_findone({ parentId: "tabs-<schemaUid>", subKey: "grid" })`
4. Hand those artifacts to `ui_write_wrapper.mjs run --action create-v2`
5. If block writing continues later, use the same "MCP first, wrapper second" flow

## Key rules

- `createV2` success only means `pageShellCreated=created`
- without route-ready evidence, report only the page shell
- flowPage v2 page content must be written to `parentId=<schemaUid>, subKey=page`
- visible flowPage v2 tabs come from child desktop routes, not `RootPageModel.subModels.tabs`
- multi-page requests should be split into page-level specs
- destroy a page only through `PostDesktoproutes_destroyv2`

## Delivery checks

Always report:

- `pageShellCreated`
- `routeReady`
- whether the page anchor is readable
- whether the hidden default tab and grid anchor are readable
- if blocks were written later, `readbackMatched` separately
