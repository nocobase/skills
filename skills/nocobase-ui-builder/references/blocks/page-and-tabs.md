# Page / Tabs

## Applies to

- `PostDesktoproutes_createv2` called through MCP first and then wrapped with `ui_write_wrapper.mjs --action create-v2`
- `RootPageModel`, `PageModel`, and `ChildPageModel`
- `RootPageTabModel`, `PageTabModel`, and `ChildPageTabModel`
- grids under tabs

Typical targets:

- normal v2 pages
- single-page structure that only uses the hidden default tab
- explicit visible tabs
- popup pages or `ChildPageModel` tabs

## Pre-write checklist

1. `createV2` only initializes the page shell. It does not repair a missing tree.
2. The hidden default tab route is always `tabs-{schemaUid}`.
3. Decide whether the task really requires explicit visible tabs or only the hidden default tab.
4. If explicit tabs are still ambiguous, clarify the page, tab, and grid layer first.
5. Define readback success criteria before writing. Do not guess them after `save ok`.
6. Choose page and tab `use` by parent page class:
   - `RootPageModel -> RootPageTabModel`
   - `PageModel -> RootPageTabModel | PageTabModel`
   - `ChildPageModel -> ChildPageTabModel`
7. The builder currently supports `popup.pageUse + blocks`, not `popup.tabs` or `popup.layout.tabs`
8. In flowPage v2, `RootPageModel` must be written to `parentId=<pageSchemaUid>, subKey=page`
9. Visible `RootPageModel` tabs are route-driven runtime structure and must not be persisted in `RootPageModel.subModels.tabs`
10. If multiple visible tabs are needed, create child desktop routes first and write each tab to `parentId=<tabSchemaUid>, subKey=grid`

## Minimal success tree

Single-page minimum:

- `ui_write_wrapper.mjs --action create-v2`
- route-tree, page-anchor, and grid-anchor artifacts
- the page root anchor
- the hidden default tab grid

Explicit tabs minimum:

- child desktop routes under the page route
- the page anchor only persists `RootPageModel`, not visible tabs
- each child route has its own `schemaUid`
- each child route has its own grid anchor
- each tab grid contains at least one real business block

## Done criteria

- when the user only wants one page, the hidden default tab is enough
- when the user explicitly asks for multiple visible tabs, distinguish hidden default tab vs explicit tabs clearly
- after `createV2`, confirm both the page route and the hidden default tab appear in the accessible route tree
- visible tabs must persist under each child route grid anchor, not under `RootPageModel`
- every tab block must attach to the correct grid
- after `save`, run write-after-read and reconcile tab count, tab titles, and each tab grid
- automatic reconciliation only works when the write tool and `GetFlowmodels_findone` both record the same `args.targetSignature` and a structured `result.summary`
- if readback only shows the page shell or `Add block`, the run is still `partial` or `failed`
- without route-ready evidence, a fresh build is only `page shell created`, not openable

## Common traps

- treating the hidden default tab as explicit-tabs capability
- writing blocks to the wrong page root or tab grid
- treating `RootPageModel.subModels.tabs` as the persistence contract of flowPage v2
- writing the page route `schemaUid` directly as `RootPageModel.uid`
- assuming `createV2` creates explicit tabs automatically
- assuming `createV2 + GetFlowmodels_findone(page/grid)` proves first-open readiness
- declaring success from `tabCount` without readback
- silently falling back to the hidden default tab when explicit tabs are unstable

## Related patterns

- [../patterns/popup-openview.md](../patterns/popup-openview.md)

## Fallback policy

- if explicit tabs remain unstable, say clearly that only the hidden default tab is stable
- for multi-tab pages, report which tabs are persisted and which tabs still lack positioning or protocol stability
- if the explicit-tabs payload itself is unstable, block the write and report the protocol issue instead of handing the user an empty shell
