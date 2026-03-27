# UI API overview

## 1. Read the local graph first, runtime schema second

Read these files before hitting runtime schema APIs:

- [flow-schemas/index.md](flow-schemas/index.md)
- `flow-schemas/manifest.json`
- `flow-schemas/models/<UseName>.json`
- `flow-schemas/catalogs/<OwnerUse>.<slot>.json`

Only go to runtime schema discovery when:

- the local graph does not cover the target `use`
- the local graph clearly conflicts with the current instance
- the task involves a new model or plugin structure not covered by the checked-in snapshot

## 2. MCP tool mapping

The default execution path is:

- call MCP directly to collect write, readback, route, and anchor artifacts
- then run `node scripts/ui_write_wrapper.mjs run --action <create-v2|save|mutate|ensure> ...` for guard, diff, contract checks, and summary persistence

Important MCP tools:

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

Rules:

- page creation: call `PostDesktoproutes_createv2`, `GetDesktoproutes_listaccessible`, and `GetFlowmodels_findone` first, then run `ui_write_wrapper.mjs --action create-v2`
- ad-hoc `save`, `mutate`, or `ensure`: call the matching `PostFlowmodels_*` tool plus `GetFlowmodels_findone` first, then run `ui_write_wrapper.mjs`
- `rest_validation_builder.mjs` and `rest_template_clone_runner.mjs` are helper scripts only; they no longer call NocoBase directly
- do not end the flow right after a raw write call; wrapper-based local validation and evidence persistence are mandatory

## 3. Request shape

Use the raw JSON body directly in `requestBody`.

- Do not send `requestBody: { "values": ... }`
- Put the original HTTP JSON request body directly into `requestBody`
- NocoBase `resourcer` wraps it into `ctx.action.params.values` internally

## 4. Schema-first discovery order

1. Read the local graph first
2. Call `PostFlowmodels_schemabundle`
3. Narrow the public `use` values needed for the current task
4. Call one `PostFlowmodels_schemas` for those target `use` values
5. If new `use` values appear later, add one incremental `PostFlowmodels_schemas`
6. Only call `GetFlowmodels_schema` if ambiguity still remains
7. Read the live target tree once with `GetFlowmodels_findone` before writing

## 5. Live snapshot cadence

1. One read before write: the only baseline for the stage
2. One read after write: confirms whether the result actually persisted

## 6. Page initialization lifecycle

`createV2` initializes:

- the page route
- the hidden default tab route: `tabs-{schemaUid}`
- the `uiSchemas` FlowRoute shell
- the page anchor: `{schemaUid} -> page`
- the default hidden tab grid anchor: `tabs-{schemaUid} -> grid`

Critical rules:

- `{schemaUid} -> page` is an anchor child, not a signal to persist `schemaUid` as `RootPageModel.uid`
- visible `RootPageModel` tabs are driven by child desktop routes
- do not treat `RootPageModel.subModels.tabs` as the persistence entrypoint for visible tabs
- write visible tab content to `parentId=<tabSchemaUid>, subKey=grid`
- `createV2` is idempotent only for the same `schemaUid + title + icon + parentId`
- if the same `schemaUid` is reused with conflicting core fields, it returns `409`
- `createV2` is not a repair interface
- `createV2` does not mean the page is openable

## 7. Route-ready

Route-ready requires:

- `GetDesktoproutes_getaccessible({ filterByTk: "<schemaUid>" })` can read the new page
- `GetDesktoproutes_listaccessible({ tree: true })` shows the page route and `tabs-{schemaUid}` child route

## 8. Reading a page

For flowPage v2:

- `RootPageModel` readback must not depend on `subModels.tabs`
- if the page uses multiple visible tabs, create child routes first, then read each `tabSchemaUid -> grid`

## 9. Write strategy and readback

The agent should not guess the low-level write tool by default. The wrapper or builder pipeline should choose it.

Typical mapping:

- multi-step transaction, `$ref` chaining, or retryable upsert: usually `PostFlowmodels_mutate`
- one known model tree with a live snapshot: usually `PostFlowmodels_save`
- missing object child already proven by schema: only then `PostFlowmodels_ensure`
- sorting only: `PostFlowmodels_move`
- deleting a known subtree only: `PostFlowmodels_destroy`
- `PostFlowmodels_duplicate` is legacy; prefer `mutate + duplicate` logic when possible

Rules:

- these tools are not ad-hoc direct entrypoints
- page-shell creation and ad-hoc live tree writes must go through `node scripts/ui_write_wrapper.mjs run ...`
- `flow_write_wrapper.mjs` is compatibility-only, not the default path
- `mutate` and `ensure` need an explicit verify payload when the request body is not already the final model tree
- for flowPage v2, the guard blocks both `RootPageModel.subModels.tabs` direct persistence and direct route `schemaUid` to `RootPageModel.uid` writes

Final truth comes from follow-up `GetFlowmodels_findone`.

- wrapper should execute post-write readback automatically
- `ok` means request accepted, not final success
- explicit tabs must reconcile count, titles, and `BlockGridModel` presence
- selector and data scope flows must reconcile `filterByTk` and `dataScope`

## 10. Destroying a page

Use `PostDesktoproutes_destroyv2` only.

Completion requires:

- the page route no longer exists
- `parentId={schemaUid}, subKey=page` returns `null`
- `parentId=tabs-{schemaUid}, subKey=grid` returns `null`
