# Execution Checklist

Use this checklist by default during execution. Only open a topic reference when a specific contract is actually hit. For cross-topic rules around blueprint-first page planning, `catalog`, popup shell fallback, and schema drift / recovery, see [normative-contract.md](./normative-contract.md).

## 1. Preflight

- Before any write, confirm that the NocoBase MCP is reachable, authenticated, and the schema is usable.
- `inspect` and `page blueprint` planning are read-only by default. Only enter a write flow when the user explicitly asks to create, modify, reorder, delete, or fix something, or when a previously shown blueprint has already been confirmed.
- If the live environment already shows an auth error, a missing critical tool, a stale schema, or a capability gap, stop writing first. For recovery, see [normative-contract.md](./normative-contract.md).

## 2. Choose Intent

- First decide the primary intent: `inspect`, `plan-page-blueprint`, `create-menu-group`, `create-page`, `update-ui`, `move-menu`, `reorder`, or `delete-ui`.
- Only add a topic gate when the task truly hits `popup`, `chart`, or `js`.
- If the request mentions template reuse, save-as-template, copy/reference mode, convert-to-copy, or template search/selection, read [templates.md](./templates.md) before choosing the write path.
- If the request involves `title` / `icon`, first identify whether it means the menu entry, the page header title, the page header icon, or a tab / popup tab. Do not jump straight to a lifecycle API just because you already have a page/tab locator.

Default path quick reference:

| intent | Default primary path | Minimum readback |
| --- | --- | --- |
| `inspect` | For menu titles, read the menu tree first. For initialized surfaces, start with `get`. Decide whether to append `catalog` via [normative-contract.md](./normative-contract.md). | `Inspect` in [verification.md](./verification.md) |
| `plan-page-blueprint` | Read [page-intent-planning.md](./page-intent-planning.md). Discover real schema facts, produce a `pageBlueprint`, and stop for user confirmation before any write. | read-only facts only; no write readback |
| `create-menu-group` | `createMenu(type="group")`; add `parentMenuRouteId` when it must attach under a specific parent | return value; menu tree if needed |
| `create-page` | `createMenu(type="item") -> createPage(menuRouteId=...)` | `get({ pageSchemaUid })` |
| `update-ui` | First resolve the visible title/icon slot. Then use `get -> [append catalog if required by normative contract] ->`. Prefer `updateMenu` for menu entries, `updateTab` / `updatePopupTab` only for tab / popup-tab semantics, page `configure` only for page-header title, and inspect the render chain first for page-header icon. For everything else, prefer `compose/add*`, then consider `configure/updateSettings`. | direct parent, direct target, or the corresponding lifecycle target |
| `move-menu` | If `menuRouteId` is already known, call `updateMenu(parentMenuRouteId=...)` directly. If you only have a menu title, read the menu tree first. | menu tree |
| `reorder` | Narrow sibling / target via `get`, then use `moveTab`, `movePopupTab`, or `moveNode` | parent, page, or route/tree |
| `delete-ui` | After `get` / menu tree makes the target and blast radius explicit, use `destroyPage`, `removeTab`, `removePopupTab`, or `removeNode` | destructive / high-impact readback |

## 3. Blueprint-First Path (`plan-page-blueprint`)

- Read [page-intent-planning.md](./page-intent-planning.md) first for any high-level page-building request.
- Use read-only schema discovery to identify real collections, fields, and associations. The allowed planning-time schema sources are the live read APIs described by the `Blueprint-First Contract` in [normative-contract.md](./normative-contract.md).
- Choose a `page archetype`, then build a `pageBlueprint` through [page-archetypes.md](./page-archetypes.md) and [page-blueprint-dsl.md](./page-blueprint-dsl.md).
- Distinguish `data-bound block`s from `non-data block`s:
  - `data-bound block`s need an explicit real data source.
  - `non-data block`s may omit `dataSourceKey`.
- Use `dataSources` to keep collection facts, association-path facts, and popup-scoped live bindings such as `currentRecord` or `associatedRecords` explicit. Do not write raw low-level `resource` objects into the blueprint layer.
- If the blueprint targets an existing page, require a real target locator in `target.locator` before the blueprint can claim `update-page`.
- If the blueprint includes popup semantics, make `popups[*].completion` explicit. Do not leave execution to guess whether a popup is `shell-only` or `completed`.
- Do not invent missing fields. If the requested page depends on schema that does not exist, surface that gap in the blueprint and stop before writes.
- Present the result as: human-readable explanation first, then a structured `pageBlueprint`.
- Stop for confirmation. Do not call `createPage`, `compose`, `add*`, `configure`, `setLayout`, or popup-building writes before the user confirms the blueprint.

## 4. Resolve Visible Slot (`title` / `icon` only)

- When the natural language uses frequent terms like `page title`, `menu title`, `tab title`, `icon`, or `small icon`, first resolve which visible slot the user actually means: the left menu, the page content header, the outer tab, or the popup tab.
- Use the default guess order from [aliases.md](./aliases.md): look for position clues first, then object name, and only then fall back to the default entry semantics of a route-backed page.
- If the user only says `page title` / `page icon` with no position clue, default to the menu entry. Do not default directly to `updateTab`.
- If the final target is a default guess rather than an explicit user designation, state it in commentary before writing: "this will modify the left menu item / page header / outer tab / popup tab".
- If the semantics land on the page-header title, continue with page `configure`.
- If the semantics land on the page-header icon, first confirm that the current header actually consumes the relevant property. If there is no rendering path, do not market it as a menu icon or tab icon, and do not treat it as the default visible path.

## 5. Resolve Family / Locator

- For menu-title discovery, always start with `desktop_routes_list_accessible(tree=true)`. It only represents the menu tree visible to the current role, not the full system truth. Only accept a uniquely matched `group`.
- For initialized surfaces, default to `flow_surfaces_get` first. Choose `uid`, `pageSchemaUid`, `tabSchemaUid`, or `routeId` based on the live locator fields.
- For mappings between family / locator / write target, see [runtime-playbook.md](./runtime-playbook.md).
- If the target is still not unique, stop. Do not guess based on sibling-relative position.

## 6. Choose Capability / Config Path

- If you are unsure whether to choose a block, action, or field, see [capabilities.md](./capabilities.md).
- If the request is still at the "what kind of page should this become" level, go back to [page-intent-planning.md](./page-intent-planning.md) instead of guessing low-level containers too early.
- If you need to choose between `settings`, `configure(changes)`, and `updateSettings`, see [settings.md](./settings.md).
- If the natural language is highly ambiguous, use [aliases.md](./aliases.md) to narrow the object semantics first.

## 7. Read Path

- For an existing surface, default to `get` first. Whether to append `catalog` is governed by the `Catalog Contract` in [normative-contract.md](./normative-contract.md).
- For page-blueprint planning, use read-only schema discovery first; do not jump into write-target reads until the blueprint is already confirmed.
- For popup guard-sensitive scenarios, follow the `guard-first popup flow` in [popup.md](./popup.md). For the `addField/addFields` gate, see [capabilities.md](./capabilities.md).
- `inspect` is read-only. For request shapes of `get` / `catalog` / `context`, see [tool-shapes.md](./tool-shapes.md).

## 8. Write Path

- Default write chain: `get -> [append catalog if required by normative contract] -> write -> readback`.
- If the request came in as a high-level page-building request, do not enter this section until the blueprint has been confirmed.
- If you are only creating a menu group, call `createMenu(type="group")` directly.
- For creating a new page, prefer the menu-first path by default: `createMenu(type="item") -> createPage(menuRouteId=...)`.
- When executing from a confirmed `pageBlueprint`, keep each block/action/field mapped back to the blueprint node:
  - `data-bound block`s must preserve the confirmed data-source semantics from `dataSources` / `dataSourceKey`.
  - `non-data block`s may stay unbound.
  - Popup actions count as incomplete unless the blueprint explicitly scoped the popup as `completion = "shell-only"`.
- If the confirmed blueprint uses popup-scoped binding data sources such as `currentRecord` or `associatedRecords`, follow the popup guard flow and verify that the live popup `catalog` still exposes the required binding before finishing execution.
- For `target.mode = "update-page"`, resolve the existing target from the confirmed locator first. Do not silently downgrade to `create-page`.
- For `title/icon` metadata changes: prefer `updateMenu` for the left menu entry; only use `updateTab` / `updatePopupTab` for explicit tab semantics; only use page `configure` for the page-header title; inspect the render chain first for the page-header icon and do not promise visible effect by default.
- For an existing target, prefer `compose/add*`, then consider `configure/updateSettings`. Only the immediate next target uid that was just returned by a write API may skip one leading `get`.
- For template-aware writes, first decide whether the write should use local inline content or a saved template reference/copy. Use [templates.md](./templates.md) for `listTemplates`, `saveTemplate`, `convertTemplateToCopy`, and `add*/compose/configure` template shapes.
- For popup payload shapes and `popup.mode`, see [tool-shapes.md](./tool-shapes.md).
- For guard-sensitive popups, always follow the `guard-first popup flow` in [popup.md](./popup.md).
- When the operation hits `setLayout`, first translate the natural language into the three-level semantics `row -> columns -> items` before writing the payload:
  - "same row / side by side / left-right split" = multiple column cells under the same `rowKey`, for example `[[left], [right]]`
  - "stacked vertically in the same column" = multiple items inside the same column cell, for example `[[top, bottom]]`
  - "two rows vertically" = different `rowKey` values, for example `row1=[[top]]`, `row2=[[bottom]]`
  - `sizes[rowKey]` must be a one-dimensional `number[]`, and its length must equal the number of columns in that row. Do not write `[[8,16]]`
- For the minimum readback target per operation, use `Operation -> Minimum readback target` in [verification.md](./verification.md).

## 9. Risk Gate

- `add*` and `compose(mode != "replace")` are append-like. `configure/updateSettings` are merge-like.
- `setLayout/setEventFlows` are high-impact full-replace operations.
- `destroyPage/remove*`, `apply(mode="replace")`, `compose(mode="replace")`, and replace-style `mutate` are destructive.
- Blueprint confirmation is also a risk gate for page-building requests. Do not treat "the user asked for a page" as automatic approval to write a guessed structure.
- For high-impact or destructive paths, explain the blast radius first. Do not default to these paths unless the user is explicitly asking for a full replacement.

## 10. Topic Gate

- `template`: read [templates.md](./templates.md) first. Also read [popup.md](./popup.md) when the template is popup-backed or field `openView`-backed.
- `popup`: read [popup.md](./popup.md) first. For exact payloads, then read [tool-shapes.md](./tool-shapes.md).
- `chart`: read [chart.md](./chart.md) first, then enter `chart-core` / `chart-validation` as needed.
- `js`: read [js.md](./js.md). Any JS write must pass the local validator gate first. For the CLI entry, see [runjs-runtime.md](./runjs-runtime.md).

## 11. Retry / Batch Failure

- If a server contract / validation error points to schema drift or a capability gap, close the loop through [normative-contract.md](./normative-contract.md). This skill does not define an abstract `refresh -> retry` chain.
- If any child item in a batch write fails, stop immediately. Report successes and failures separately, do not auto-rollback, and do not continue with downstream writes that depend on "all succeeded". For post-write acceptance, see [verification.md](./verification.md).

## 12. Stop / Handoff

- If you hit insufficient auth, a stale schema, a missing capability / contract / guard, a non-unique target, or an undecidable validator result, stop guessing writes. For recovery, see [normative-contract.md](./normative-contract.md).
- If page-blueprint planning proves that the requested fields, relations, or collections do not exist yet, stop the UI write path and hand off schema authoring to `nocobase-data-modeling`.
- ACL / route permissions / role permissions -> `nocobase-acl-manage`
- collection / association / field schema authoring -> `nocobase-data-modeling`
- workflow create / update / revision / execution path -> `nocobase-workflow-manage`
