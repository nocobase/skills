# Execution Checklist

Use this checklist by default during execution. Only open a topic reference when a specific contract is actually hit. For cross-topic rules around `catalog`, popup shell fallback, and schema drift / recovery, see [normative-contract.md](./normative-contract.md).

## 1. Preflight

- Before any write, confirm that the NocoBase MCP is reachable, authenticated, and the schema is usable.
- `inspect` is read-only by default. Only enter a write flow when the user explicitly asks to create, modify, reorder, delete, or fix something.
- If the live environment already shows an auth error, a missing critical tool, a stale schema, or a capability gap, stop writing first. For recovery, see [normative-contract.md](./normative-contract.md).

## 2. Choose Intent

- First decide the primary intent: `inspect`, `create-menu-group`, `create-page`, `update-ui`, `move-menu`, `reorder`, or `delete-ui`.
- Only add a topic gate when the task truly hits `popup`, `chart`, or `js`.
- If the request involves `title` / `icon`, first identify whether it means the menu entry, the page header title, the page header icon, or a tab / popup tab. Do not jump straight to a lifecycle API just because you already have a page/tab locator.

Default path quick reference:

| intent | Default primary path | Minimum readback |
| --- | --- | --- |
| `inspect` | For menu titles, read the menu tree first. For initialized surfaces, start with `get`. Decide whether to append `catalog` via [normative-contract.md](./normative-contract.md). | `Inspect` in [verification.md](./verification.md) |
| `create-menu-group` | `createMenu(type="group")`; add `parentMenuRouteId` when it must attach under a specific parent | return value; menu tree if needed |
| `create-page` | `createMenu(type="item") -> createPage(menuRouteId=...)` | `get({ pageSchemaUid })` |
| `update-ui` | First resolve the visible title/icon slot. Then use `get -> [append catalog if required by normative contract] ->`. Prefer `updateMenu` for menu entries, `updateTab` / `updatePopupTab` only for tab / popup-tab semantics, page `configure` only for page-header title, and inspect the render chain first for page-header icon. For everything else, prefer `compose/add*`, then consider `configure/updateSettings`. | direct parent, direct target, or the corresponding lifecycle target |
| `move-menu` | If `menuRouteId` is already known, call `updateMenu(parentMenuRouteId=...)` directly. If you only have a menu title, read the menu tree first. | menu tree |
| `reorder` | Narrow sibling / target via `get`, then use `moveTab`, `movePopupTab`, or `moveNode` | parent, page, or route/tree |
| `delete-ui` | After `get` / menu tree makes the target and blast radius explicit, use `destroyPage`, `removeTab`, `removePopupTab`, or `removeNode` | destructive / high-impact readback |

## 3. Resolve Visible Slot (`title` / `icon` only)

- When the natural language uses frequent terms like `page title`, `menu title`, `tab title`, `icon`, or `small icon`, first resolve which visible slot the user actually means: the left menu, the page content header, the outer tab, or the popup tab.
- Use the default guess order from [aliases.md](./aliases.md): look for position clues first, then object name, and only then fall back to the default entry semantics of a route-backed page.
- If the user only says `page title` / `page icon` with no position clue, default to the menu entry. Do not default directly to `updateTab`.
- If the final target is a default guess rather than an explicit user designation, state it in commentary before writing: "this will modify the left menu item / page header / outer tab / popup tab".
- If the semantics land on the page-header title, continue with page `configure`.
- If the semantics land on the page-header icon, first confirm that the current header actually consumes the relevant property. If there is no rendering path, do not market it as a menu icon or tab icon, and do not treat it as the default visible path.

## 4. Resolve Family / Locator

- For menu-title discovery, always start with `desktop_routes_list_accessible(tree=true)`. It only represents the menu tree visible to the current role, not the full system truth. Only accept a uniquely matched `group`.
- For initialized surfaces, default to `flow_surfaces_get` first. Choose `uid`, `pageSchemaUid`, `tabSchemaUid`, or `routeId` based on the live locator fields.
- For mappings between family / locator / write target, see [runtime-playbook.md](./runtime-playbook.md).
- If the target is still not unique, stop. Do not guess based on sibling-relative position.

## 5. Choose Capability / Config Path

- If you are unsure whether to choose a block, action, or field, see [capabilities.md](./capabilities.md).
- If you need to choose between `settings`, `configure(changes)`, and `updateSettings`, see [settings.md](./settings.md).
- If the natural language is highly ambiguous, use [aliases.md](./aliases.md) to narrow the object semantics first.

## 6. Read Path

- For an existing surface, default to `get` first. Whether to append `catalog` is governed by the `Catalog Contract` in [normative-contract.md](./normative-contract.md).
- For popup guard-sensitive scenarios, follow the `guard-first popup flow` in [popup.md](./popup.md). For the `addField/addFields` gate, see [capabilities.md](./capabilities.md).
- `inspect` is read-only. For request shapes of `get` / `catalog` / `context`, see [tool-shapes.md](./tool-shapes.md).

## 7. Write Path

- Default write chain: `get -> [append catalog if required by normative contract] -> write -> readback`.
- If you are only creating a menu group, call `createMenu(type="group")` directly.
- For creating a new page, prefer the menu-first path by default: `createMenu(type="item") -> createPage(menuRouteId=...)`.
- For `title/icon` metadata changes: prefer `updateMenu` for the left menu entry; only use `updateTab` / `updatePopupTab` for explicit tab semantics; only use page `configure` for the page-header title; inspect the render chain first for the page-header icon and do not promise visible effect by default.
- For an existing target, prefer `compose/add*`, then consider `configure/updateSettings`. Only the immediate next target uid that was just returned by a write API may skip one leading `get`.
- For popup payload shapes and `popup.mode`, see [tool-shapes.md](./tool-shapes.md).
- For guard-sensitive popups, always follow the `guard-first popup flow` in [popup.md](./popup.md).
- When the operation hits `setLayout`, first translate the natural language into the three-level semantics `row -> columns -> items` before writing the payload:
  - "same row / side by side / left-right split" = multiple column cells under the same `rowKey`, for example `[[left], [right]]`
  - "stacked vertically in the same column" = multiple items inside the same column cell, for example `[[top, bottom]]`
  - "two rows vertically" = different `rowKey` values, for example `row1=[[top]]`, `row2=[[bottom]]`
  - `sizes[rowKey]` must be a one-dimensional `number[]`, and its length must equal the number of columns in that row. Do not write `[[8,16]]`
- For the minimum readback target per operation, use `Operation -> Minimum readback target` in [verification.md](./verification.md).

## 8. Risk Gate

- `add*` and `compose(mode != "replace")` are append-like. `configure/updateSettings` are merge-like.
- `setLayout/setEventFlows` are high-impact full-replace operations.
- `destroyPage/remove*`, `apply(mode="replace")`, `compose(mode="replace")`, and replace-style `mutate` are destructive.
- For high-impact or destructive paths, explain the blast radius first. Do not default to these paths unless the user is explicitly asking for a full replacement.

## 9. Topic Gate

- `popup`: read [popup.md](./popup.md) first. For exact payloads, then read [tool-shapes.md](./tool-shapes.md).
- `chart`: read [chart.md](./chart.md) first, then enter `chart-core` / `chart-validation` as needed.
- `js`: read [js.md](./js.md). Any JS write must pass the local validator gate first. For the CLI entry, see [runjs-runtime.md](./runjs-runtime.md).

## 10. Retry / Batch Failure

- If a server contract / validation error points to schema drift or a capability gap, close the loop through [normative-contract.md](./normative-contract.md). This skill does not define an abstract `refresh -> retry` chain.
- If any child item in a batch write fails, stop immediately. Report successes and failures separately, do not auto-rollback, and do not continue with downstream writes that depend on "all succeeded". For post-write acceptance, see [verification.md](./verification.md).

## 11. Stop / Handoff

- If you hit insufficient auth, a stale schema, a missing capability / contract / guard, a non-unique target, or an undecidable validator result, stop guessing writes. For recovery, see [normative-contract.md](./normative-contract.md).
- ACL / route permissions / role permissions -> `nocobase-acl-manage`
- collection / association / field schema authoring -> `nocobase-data-modeling`
- workflow create / update / revision / execution path -> `nocobase-workflow-manage`
