# Verification

Read this file when you need to do `inspect`, `page blueprint` planning, or when you need to confirm whether a write was actually persisted. For family / locator / write target, see [runtime-playbook.md](./runtime-playbook.md). For request shapes, see [tool-shapes.md](./tool-shapes.md). For popup details, see [popup.md](./popup.md). Whether blueprint confirmation or `catalog` is required, and how success must be phrased for `shell-only popup`, is governed by [normative-contract.md](./normative-contract.md).

## Inspect

### Core Rules

- `inspect` and `page blueprint` planning are read-only. Do not call any write API.
- For menu-title discovery, default to `desktop_routes_list_accessible(tree=true)` first. It only represents the menu tree visible to the current role, not the full system truth. For initialized surfaces, default to `get` first.
- Whether to continue with `catalog` is governed by the `Catalog Contract` in [normative-contract.md](./normative-contract.md).
- `inspect` or blueprint output should focus on the current structure, key uid / route / capability / schema facts, and blockers. Do not mix in wording like "write succeeded" or "already persisted".

### Acceptance Levels

- `structural-confirmed`: menu tree / `get` / route-tree readback has confirmed that the structure exists, is in the correct position, and the node was persisted.
- `semantic-confirmed`: beyond structure, the target semantics were also confirmed through live capability / binding / context / code consistency.
- `partial/unverified`: the write returned success, but live readback was insufficient to confirm the semantics the user actually cares about. You must say that verification is incomplete.

### Minimum Read Chain

| target family | Default read order | Common reasons to append more reads (still governed by normative contract) |
| --- | --- | --- |
| `menu-group` | `desktop_routes_list_accessible(tree=true)` | usually not needed |
| `menu-item` | menu tree; then `get` via `routeId/pageSchemaUid` if needed | the user wants internal page capability, and the menu item has already been initialized as `flowPage` |
| `page` / `outer-tab` / `route-content` | `get` | need capability / contract / `configureOptions` / `settingsContract` |
| `popup-page` / `popup-tab` / `popup-content` | `get` | need popup creation capability, `resourceBindings`, or event/settings contract |
| `node` | `get` | need to determine public container capability or a path-level contract precisely |
| `page blueprint` | schema discovery + menu/context reads only | need live capability narrowing, real field proof, or association facts |

### Read-Only Assertions

- Menu: unique match, clear `routeId/type/parentMenuRouteId`, and whether the `menu-item` has already been initialized.
- Page / `outer-tab`: `pageSchemaUid/tabSchemaUid/routeId` is locatable, title / icon / documentTitle / order are clear, and `gridUid` has been obtained when needed.
- `route-content` / popup subtree / normal node: whether `tree/nodeMap` contains the target block / field / action; whether the popup subtree already has `popupPageUid/popupTabUid/popupGridUid`; and if the user cares about "current record", whether live `catalog.blocks[].resourceBindings` actually exposes `currentRecord`.
- `page blueprint`: whether each `data-bound block` is backed by real schema facts through `dataSources` / `dataSourceKey`, whether popup-scoped bindings such as `currentRecord` or `associatedRecords` were actually proven by live facts, whether each `non-data block` is correctly left unbound when appropriate, whether `update-page` includes a real target locator, whether required `interactions` are explicit, whether popup `completion` is explicit, whether every page block is covered by `layout`, and whether unresolved schema gaps are stated before execution.

## Write Readback

### Usage Principles

- After a write, only verify targets directly related to the current change. Upgrade to full verification only when lifecycle or route/tree hierarchy changed.
- For menu writes, prioritize checking `routeId/type/parentMenuRouteId`. For menu moves, upgrade to menu-tree readback rather than flow-tree validation.
- Popup, field, and configuration assertions must follow live readback. Do not treat the write response alone as completion.
- `shell-only popup` can only be accepted as `structural-confirmed`. Do not describe it as popup content being completed.
- Batch writes are not the default preference. If you use `addBlocks/addFields/addActions/addRecordActions`, inspect `ok/error/index` item by item. Stop on any failure, report successes and failures separately, do not auto-rollback, and do not continue downstream writes that depend on "all succeeded".
- `setLayout` and `setEventFlows` are high-impact full-replace operations. Read the full current state before writing, and validate against the full layout / flow state after writing. Do not judge success by a local delta.
- `destroyPage`, `removeTab`, `removePopupTab`, `removeNode`, `apply(mode="replace")`, and `mutate` combinations that delete / replace an existing subtree are destructive paths. Explain the blast radius before execution, and during readback prioritize confirming that the deletion / replacement boundary matches expectations.

### Operation -> Minimum Readback Target

| Operation | Minimum readback target | When to upgrade to full route/tree validation |
| --- | --- | --- |
| `createMenu(type="group")` | return value; menu-tree readback if needed | when a parent menu is specified, or when a page will be attached under it next |
| `createMenu(type="item")` | return value; if the user only wants a menu entry, read the menu tree to confirm position | do not upgrade separately when `createPage(menuRouteId=...)` follows immediately |
| `updateMenu` | return value; read the menu tree when moving | when changing parent, discovering the target menu by title, or confirming the final attachment position |
| `createPage` | `get({ pageSchemaUid })` | always upgrade |
| `addTab/updateTab/moveTab/removeTab` | `page` or the corresponding `outer-tab` | always upgrade |
| `addPopupTab/updatePopupTab/movePopupTab/removePopupTab` | `popup-page` or the corresponding `popup-tab` | always upgrade |
| `compose/addBlock/addField/addAction/addRecordAction` | direct parent / direct container target | do not upgrade |
| `configure/updateSettings` | modified target; direct parent if needed | do not upgrade |
| `setLayout` | target container + full `rows/sizes/rowOrder` state | always validate as a full layout |
| `setEventFlows` | modified target + full flow state | always validate as a full flow state |
| `apply/mutate` | directly affected target; if subtree hierarchy changes, then read the parent too | only upgrade when structural hierarchy actually changed |

### Readback Focus Points

- Menu: correct `routeId` type, synchronized `parentMenuRouteId`, title, icon, tooltip, and `hideInMenu`; do not misclassify `createMenu(type="item")` as an initialized page.
- Page / `outer-tab`: page route / tab route exists and is in the right order; if visible in the live environment, `pageRoute.options.flowSurfacePageInitialized = true`; a newly added tab has its grid anchor filled in.
- `popup-tab`: the popup page still exists, tab count and order are correct, `tree.use = ChildPageTabModel`, and any newly added tab has its grid anchor filled in.
- Popup subtree: confirm that `popupPageUid/popupTabUid/popupGridUid` is attached at the correct place. If the target was only a `shell-only popup`, it can be at most `structural-confirmed`. If the scenario is viewing or editing the current record, `popupGridUid` must contain more than an empty shell, and if resource binding is visible live, additionally confirm that `details/editForm` binds to `currentRecord` before calling it `semantic-confirmed`.
- Structure / fields / configuration: the new node is findable in `tree/nodeMap`; the table has `actionsColumnUid`; record-popup `details/editForm/submit` actually exists; the field is located down to `wrapperUid/fieldUid/innerFieldUid`; and `flowRegistry`, layout, and association-field `clickToOpen/openView` were persisted.
- `setLayout`: `rows/sizes/rowOrder` fully matches expectations, and child coverage matches the number of column widths. Do not only check whether a single child still exists.
- `setLayout`: if the user intent is "side by side in the same row / left-right split", readback must confirm that each target uid lands in a different top-level cell within the same row, for example `[[left], [right]]`. If readback shows `[[left, right]]`, it is a failure even if both children exist.
- `setLayout`: `sizes[rowKey]` must be a one-dimensional `number[]`, and its length must equal the number of columns in that row. Nested arrays or readback that degenerates into "only one narrow left column with blank space on the right" both count as failure, not partial success.
- `setEventFlows`: the final flow set must fully match expectations, with no stale flow left behind and no required binding within scope accidentally dropped.
- Direct to-many association display field with ordinary display intent: if the user added a details/list/gridCard field like `users.roles`, confirm during readback that it did not degrade into a sub-table-style use. If needed, also confirm that `fieldSettings.init.fieldPath` was normalized to the association field itself, such as `roles` rather than `roles.title`, and that `titleField` was persisted.
- Explicit sub-table intent on an existing association field: if the user asked to switch an existing details/list/gridCard field such as `roles` into sub-table display, confirm during readback that the original field wrapper still exists, its wrapper-level model setting switched to `DisplaySubTableFieldModel`, the inner field `tree.use` also became `DisplaySubTableFieldModel`, and `fieldSettings.init` still binds to the same association field. Also confirm that no accidental extra table block or stale layout row was left behind while performing the switch.
- `filterForm` wiring: do not only look at the `addField` return value, and do not only check whether the filter field itself exists. In multi-target scenarios, treat `filterManager` in the parent content-container readback as a common success signal, and when live visibility allows, also verify that field-level target binding info such as `defaultTargetUid` matches expectations.
- RunJS: besides UI-structure readback, also confirm that the final persisted `code` is exactly the same as the code that passed the validator gate.
