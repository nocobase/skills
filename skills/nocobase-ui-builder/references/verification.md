# Verification

Read this file when you need to do `inspect`, produce a DSL draft, or confirm whether a write was actually persisted. For family / locator / write target, see [runtime-playbook.md](./runtime-playbook.md). For request shapes, see [tool-shapes.md](./tool-shapes.md). For popup details, see [popup.md](./popup.md). Whether confirmation is required first, and how success must be phrased for `shell-only popup`, is governed by [normative-contract.md](./normative-contract.md).

## 1. Inspect / Draft Verification

### Core rules

- `inspect` and DSL drafting are read-only. Do not call any write API.
- For menu-title discovery, default to `desktop_routes_list_accessible(tree=true)` first. It only represents the menu tree visible to the current role, not the full system truth. For initialized surfaces, default to `get` first.
- `describeSurface` is the execution-anchor read for an existing surface. Use it when the next step is DSL execution and you need `fingerprint` / `refs`; do not treat it as the default inspect entry.
- Whether to continue with `catalog` is governed by the `Catalog Contract` in [normative-contract.md](./normative-contract.md).
- `inspect` or DSL draft output should focus on the current structure, key uid / route / capability / schema facts, and blockers. Do not mix in wording like "write succeeded" or "already persisted".

### Acceptance levels

- `structural-confirmed`: menu tree / `get` / route-tree readback has confirmed that the structure exists, is in the correct position, and the node was persisted.
- `semantic-confirmed`: beyond structure, the target semantics were also confirmed through live capability / binding / context / code consistency.
- `partial/unverified`: the write returned success, but live readback was insufficient to confirm the semantics the user actually cares about. You must say that verification is incomplete.

### Read-only assertions

- Menu: unique match, clear `routeId/type/parentMenuRouteId`, and whether the `menu-item` has already been initialized.
- Page / `outer-tab`: `pageSchemaUid/tabSchemaUid/routeId` is locatable, title / icon / documentTitle / order are clear, and `gridUid` has been obtained when needed.
- `route-content` / popup subtree / normal node: whether `tree/nodeMap` contains the target block / field / action; whether the popup subtree already has `popupPageUid/popupTabUid/popupGridUid`; and if the user cares about `current record`, whether live `catalog.blocks[].resourceBindings` actually exposes `currentRecord`.
- `blueprint DSL`: whether each `data-bound block` is backed by real schema facts through `dataSources` / `dataSourceKey`, whether popup-scoped bindings such as `currentRecord` or `associatedRecords` were actually proven by live facts, whether each `non-data block` is correctly left unbound when appropriate, whether `update-page` includes a real target locator, whether required `interactions` are explicit, whether popup `completion` is explicit, whether every page block is covered by `layout`, and whether unresolved schema gaps are stated before execution.
- `patch DSL`: whether the target locator is real, each change target/source is resolvable, destructive scope is explicit, and `unresolvedQuestions` is empty before execution.

## 2. Write Readback

### Usage principles

- After a write, only verify targets directly related to the current change. Upgrade to full verification only when lifecycle or route/tree hierarchy changed.
- Popup, field, and configuration assertions must follow live readback. Do not treat the write response alone as completion.
- `executeDsl` may already perform backend strict verification, but user-facing confirmation still requires local readback according to lifecycle semantics.
- `shell-only popup` can only be accepted as `structural-confirmed`. Do not describe it as popup content being completed.
- Batch writes are not the default preference. If you use `addBlocks/addFields/addActions/addRecordActions`, inspect `ok/error/index` item by item. Stop on any failure, report successes and failures separately, do not auto-rollback, and do not continue downstream writes that depend on `all succeeded`.
- `setLayout` and `setEventFlows` are high-impact full-replace operations. Read the full current state before writing, and validate against the full layout / flow state after writing.
- `destroyPage`, `removeTab`, `removePopupTab`, `removeNode`, `apply(mode="replace")`, and replace-style subtree operations are destructive paths. Explain the blast radius before execution, and during readback prioritize confirming that the deletion / replacement boundary matches expectations.

### Operation -> minimum readback target

| Operation | Minimum readback target | When to upgrade |
| --- | --- | --- |
| `createMenu(type="group")` | return value; menu-tree readback if needed | when a parent menu is specified, or when a page will be attached under it next |
| `createMenu(type="item")` | return value; if the user only wants a menu entry, read the menu tree to confirm position | do not upgrade separately when `createPage(menuRouteId=...)` follows immediately |
| `updateMenu` | return value; read the menu tree when moving | when changing parent, discovering the target menu by title, or confirming the final attachment position |
| `createPage` | `get({ pageSchemaUid })` | always upgrade |
| `executeDsl` (new page / blueprint create-page) | returned ids/refs -> menu tree for created groups/items -> `get({ pageSchemaUid })` for the created page | when the run creates multiple menu/page nodes, changes parent attachment, or initializes a new route-backed page |
| `executeDsl` (existing-surface blueprint or patch) | directly affected surface or returned refs, then local `get` readback as needed | when route/tree hierarchy, popup structure, or tab structure changed |
| `addTab/updateTab/moveTab/removeTab` | `page` or the corresponding `outer-tab` | always upgrade |
| `addPopupTab/updatePopupTab/movePopupTab/removePopupTab` | `popup-page` or the corresponding `popup-tab` | always upgrade |
| `compose/addBlock/addField/addAction/addRecordAction` | direct parent / direct container target | do not upgrade |
| `configure/updateSettings` | modified target; direct parent if needed | do not upgrade |
| `setLayout` | target container + full `rows/sizes/rowOrder` state | always validate as a full layout |
| `setEventFlows` | modified target + full flow state | always validate as a full flow state |
| `apply/mutate` | directly affected target; if subtree hierarchy changes, then read the parent too | only upgrade when structural hierarchy actually changed |

### Readback focus points

- `executeDsl` / create-page: confirm the menu item is no longer a pre-init placeholder, `pageSchemaUid` is readable through `get`, page/tab routes exist, and the grid anchor has been initialized.
- Menu: correct `routeId` type, synchronized `parentMenuRouteId`, title, icon, tooltip, and `hideInMenu`; do not misclassify `createMenu(type="item")` as an initialized page.
- Page / `outer-tab`: page route / tab route exists and is in the right order; if visible in the live environment, `pageRoute.options.flowSurfacePageInitialized = true`; a newly added tab has its grid anchor filled in.
- `popup-tab`: the popup page still exists, tab count and order are correct, `tree.use = ChildPageTabModel`, and any newly added tab has its grid anchor filled in.
- Popup subtree: confirm that `popupPageUid/popupTabUid/popupGridUid` is attached at the correct place. If the target was only a `shell-only popup`, it can be at most `structural-confirmed`. If the scenario is viewing or editing the current record, `popupGridUid` must contain more than an empty shell. Backend-default CRUD popup content counts as valid only after readback has confirmed `details`, `editForm`, or `submit` as applicable.
- Structure / fields / configuration: the new node is findable in `tree/nodeMap`; the table has `actionsColumnUid`; record-popup `details/editForm/submit` actually exists; the field is located down to `wrapperUid/fieldUid/innerFieldUid`; and `flowRegistry`, layout, and association-field `clickToOpen/openView` were persisted.
- `setLayout`: `rows/sizes/rowOrder` fully matches expectations. If the user intent is `side by side in the same row / left-right split`, readback must confirm that each target uid lands in a different top-level cell within the same row.
- `setEventFlows`: the final flow set must fully match expectations, with no stale flow left behind and no required binding accidentally dropped.
- RunJS: besides UI-structure readback, also confirm that the final persisted `code` is exactly the same as the code that passed the validator gate.
