# Whole-page Quick Route

Use this file as the default first stop for whole-page `create` / `replace` work.

Stay on this route when the user is asking for a full page or one route-backed tab, not a small patch on an existing live surface.

Treat these as whole-page too: a whole page create / replace, one route-backed tab full build, a complex multi-block page, a nested-popup page, or a page with multiple reaction families.

## Common-case flow

1. Pick the simplest page shape directly:
   - management page with explicit filter/search block/form intent -> read [blocks/filter-form.md](./blocks/filter-form.md) and keep a real `filterForm` in the same blueprint
   - tree filter / 树筛选 / 树状筛选 -> read [blocks/tree.md](./blocks/tree.md) and keep a real `tree` block bound to the target collection
   - management page with ambiguous filter wording, or with wording that explicitly adds search to table/list/grid/card-like content -> keep the data block and materialize a block-level `filter` action
   - management page without filtering -> table, list, details, or another primary data block
   - detail page -> details block, maybe one related table
   - analytics dashboard / 分析看板 -> summary, charts, light actions
   - kanban / pipeline / 状态列 / 拖拽 / 泳道 / backlog -> kanban
   - portal / static page -> markdown, iframe, `jsBlock`, or `actionPanel`
2. Default a normal request to exactly one real tab.
3. Collect live collection metadata before choosing fields. Any field used in the blueprint should come from live metadata and should have a non-empty `interface`.
   - You do not need to hand-build a complete helper envelope before `prepare-write`; pass any metadata you already have, and the CLI fills missing collection entries before validation.
   - On every whole-page draft, recompute the involved target collections from that live metadata and rebuild `defaults.collections` from scratch instead of patching an old fragment.
   - Under `defaults.collections`, every involved direct collection always carries fixed `popups.view` / `addNew` / `edit` `{ name, description }` objects, and any `table` block always pulls its collection into the `addNew` threshold evaluation even when the draft omitted an explicit `addNew` opener.
   - For whole-page popup defaults, generate top-level `defaults.collections.<collection>.fieldGroups` only when one of those fixed backend-generated popup scenes should still have more than 10 effective fields after scene filtering; for 10 or fewer, omit `fieldGroups`.
   - Keep `fieldGroups` collection-only on the target collection; do not create per-association `fieldGroups`. Keep relation-field popup descriptors under `popups.associations.<associationField>.<action>` with the same fixed `view` / `addNew` / `edit` `{ name, description }` contract, keyed only by the first relation segment.
   - Keep defaults collection-level only: do not generate `defaults.blocks`, and do not put `blocks`, `fields`, `fieldGroups`, or layout inside `popups`.
4. For fresh page creation under a menu group, default to one whole-page `applyBlueprint` `create` write. Pre-write reads, metadata fetch, preview, and `prepare-write` are allowed, but the first mutating write must be `applyBlueprint`.
   - Before one whole-page `applyBlueprint` succeeds, do not call `createMenu`, `createPage`, `compose`, `configure`, `update-settings`, `add*`, `move*`, `remove*`, or `set*Rules`.
   - If a whole-page `applyBlueprint` fails before first success, repair the blueprint from the error, rerun `prepare-write` and preview, and retry blueprint-only up to 5 rounds. Do not continue with low-level writes during those pre-success retries. After 5 failed rounds, report the latest blueprint / preview / error evidence.
   - Agent orchestration rule: if one request spans multiple pages and they share the same menu group title, serialize the page runs yourself. On the first page, use `navigation.group.title` to create or resolve the shared group and capture the returned `routeId`; for subsequent pages, set `navigation.group` to `{ routeId }` and do not use title-only creation. Do not start concurrent title-only group creates for the same shared group. Concurrent title-only shared-group creates are forbidden.
5. For `create`, any newly created `navigation.group` and any top-level or second-level `navigation.item` must include one valid semantic Ant Design icon. When `navigation.item` is attached under one explicit existing `navigation.group.routeId`, keep an icon by default but do not assume the local preview can prove whether that live target is already third-level or deeper.
6. If visible same-title menu groups already exist, do not pick one locally and do not create another same-title group just to disambiguate. Require explicit `navigation.group.routeId` before the write whenever title lookup would hit multiple groups.
   - The real-write prepare helper resolves `navigation.group.title` against live `desktopRoutes` when possible. If exactly one same-title group exists, use the prepared `cliBody` with `navigation.group.routeId`; if more than one exists, stop on the local error and ask for the routeId.
7. When the page is being created now, keep structure, popup, and whole-page interaction logic in the same blueprint:
   - root blocks in `tabs[].blocks[]`
   - popup content inline under the owning field/action/record action
   - interaction logic in top-level `reaction.items[]`
   - in display hosts (`table`, `details`, `list`, `gridCard`), first-level relation fields such as `roles` must use object form with inline `popup`; do not leave them as ``"roles"`` or `{ "field": "roles" }`
   - that relation field popup must also bind its child blocks correctly: `details` / `editForm` use `resource.binding = "currentRecord"` for the clicked related record, while relation tables/lists/cards use `resource.binding = "associatedRecords"` plus `resource.associationField`
   - dotted paths such as `department.title` stay allowed without popup, and `createForm` / `editForm` are exempt from that display-only rule
8. If the page explicitly asks for a tree filter (`树筛选 / 树状筛选 / tree filter`), keep a real `tree` block in that first-pass blueprint or localized write:
   - use `type: "tree"` / `TreeBlockModel`
   - bind it to the requested collection with live metadata
   - when connecting the tree to a same-blueprint table/list/gridCard/calendar/kanban/details/chart/map/comments/tree target, prefer Blueprint-stage `settings.connectFields.targets[].target` with the target block key
   - same collection may omit `filterPaths`; cross-collection tree connects must provide `filterPaths`, for example `["department.id"]`
   - do not repeat the same target in one tree `targets` array; keep one entry with the final `filterPaths`
   - `titleField` is display-only; the selected filter value comes from the tree key / `filterTargetKey`, so keep target `filterPaths` type-compatible with that key
   - prefer `title`, `searchable`, `includeDescendants`, `defaultExpandAll`, `titleField`, `fieldNames`, `pageSize`, `dataScope`, and `sorting` settings
   - use canonical `settings.sorting`; legacy `settings.sort` is only a compatibility alias that prepare-write normalizes
   - do not write raw `filterManager`; let `settings.connectFields` persist the front-end “连接数据区块” configuration
   - do not downgrade it into `filterForm` just because the phrase also contains `筛选`
9. If the page explicitly asks for a filter block/form, keep a real `filterForm` in that first-pass blueprint:
   - add non-empty filter `fields`
   - when the filter has fewer than 4 fields, add `actions: ["submit", "reset"]`
   - when the filter has 4 or more fields, add `actions: ["submit", "reset", "collapse"]`
   - point each filter field `target` at a same-blueprint table key as a plain string block key
   - if the page has one filter for `users` and one for `roles`, keep both `filterForm` blocks in the same first layout row and let each field target only its own same-blueprint table key
   - do not push `defaultTargetUid`, `filterManager`, or block-level `fields` / `actions` into raw `settings`
10. If the page only says “增加筛选 / filter” on an existing or requested table/list/gridCard/calendar/kanban-like surface, or explicitly adds “搜索 / search” to that data surface, including wording such as “支持搜索 / 带搜索 / 可搜索 / searchable”, default to the block action slot instead:
   - use that same host's block-level `filter` action/button; shorthand or object action form is valid
   - for every direct, non-template public `table` / `list` / `gridCard` / `calendar` / `kanban` block in the blueprint, always add a non-empty block-level `defaultFilter`
   - choose 3 to 4 common live fields when available and ensure block-level `defaultFilter.items` covers them; if fewer than 3 suitable business fields exist, cover every available candidate instead
   - the `filter` action is optional; if you also provide action-level `settings.defaultFilter`, that action-level payload takes precedence over the block-level one
   - do not upgrade that request into `filterForm` unless the user explicitly names a filter/search block, form, or query area
   - do not treat page-noun wording such as “搜索页 / 搜索结果页 / 搜索门户 / 搜索列表页” as a filter request just because the page also mentions list/grid/card presentation, even if the same sentence also says “支持搜索”
   - if the user explicitly names the host, keep the action on that host type instead of silently moving it to another companion block
11. For update action field assignment, use only `settings.assignValues`:
   - `bulkUpdate` is a collection action under block `actions`
   - `updateRecord` is a record action under `recordActions`
   - keys must exist in the host collection metadata, and `{}` clears assignment values
   - do not use `add-fields`, raw `flowModels`, `AssignFormGridModel`, or `AssignFormItemModel` for this configuration
12. If one tab or popup contains multiple non-filter blocks, give it explicit `layout`, avoid one-row-one-block stacking, and give each non-template-backed data block a `title`; template-backed blocks are exempt. A single non-filter block may omit its block `title` unless the user explicitly asks for one. Filter blocks should sit alone in the first row when they are present.
   - For `createForm`, `editForm`, `details`, or `filterForm`, use block-level `fieldsLayout` when the draft must control the inner field grid directly.
   - For `createForm`, `editForm`, or `details`, once the block has more than 10 real fields, replace flat `fields[]` authoring with explicit `fieldGroups`.
   - `fieldGroups` and `fieldsLayout` must not be combined, and manual `divider` entries do not satisfy the large-form grouping rule.
13. Keep popup semantics close to the opener:
   - relation-field click-to-open -> prefer field popup
   - explicit operation button -> prefer action / record-action popup
   - custom edit popup -> keep exactly one `editForm` block in that popup
14. A successful `apply-blueprint` response is the default stop point. Run follow-up `get` only when follow-up localized work or explicit inspection needs live structure. When that happens, normalize locators:
   - keep menu placement on `routeId` only
   - use `pageSchemaUid` for `nb api flow-surfaces get`
   - use live `uid` values returned by `get` / `describe-surface` / create responses for `catalog`, `context`, `get-reaction-meta`, `compose`, `configure`, `add*`, and `remove*`
   - never pass a desktop-route `id` as `target.uid`
   - after one successful whole-page `applyBlueprint`, localized low-level repair is allowed only for an explicit local/live gap and should stay narrow
15. For normal local drafting or artifact-only tasks, stay on this file. Do not enumerate the skill directory or open helper/runtime docs just to reconfirm the route.
16. For artifact-only drafts, do not open [helper-contracts.md](./helper-contracts.md); draft the preview/checklist directly from the blueprint. Open it only when preparing a real write or running the local prewrite gate.
17. Open [tool-shapes.md](./tool-shapes.md) only when you are preparing the exact nb body or nb helper envelope. For the first real whole-page write, `prepare-write` is mandatory, and the exact nb body becomes `result.cliBody`, not the original draft blueprint.
18. For the common nested-popup pattern used by real builds, open [popup.md](./popup.md) directly instead of searching the whole references tree.

## Complex Whole-page Guardrails

These are still whole-page requests, not a separate route.

- Keep one `applyBlueprint` as the default path even when the page has multiple work areas, paired tables, multiple forms, nested popups, or several reaction families.
- Give an explicit `key` to every block, field, or action that will be referenced by:
  - `layout`
  - `filterForm` field `target`
  - top-level `reaction.items[].target`
  - nested popup reaction or readback evidence
- Keep whole-page reaction targets on stable public paths such as:
  - `main.primaryCreateForm`
  - `main.primaryTable.viewAction`
  - `main.secondaryTable.protectedDeleteAction`
- When a form action must be targeted by `reaction.items[]`, do not leave that action as a plain string. Upgrade it to one keyed action object in the first-pass blueprint, for example `{ "key": "submitAction", "type": "submit" }`, then target `main.primaryCreateForm.submitAction`.
- For `filterForm`, keep the field `target` on a same-blueprint string block key. Do not mix public whole-page `target` with low-level `defaultTargetUid`.
- Do not treat "two filter forms targeting two different tables" as a contract gap by itself. Try the direct public whole-page shape first.
- When a `filterForm` has 4 or more fields, include `collapse` in its filter-form action family. Keep the filter block alone in the first layout row when an explicit layout is present.
- When one tab or popup contains multiple non-filter blocks, explicit layout is no longer optional. The layout must reference real keyed blocks and place every keyed block.
- For computed defaults, autofill, block visibility, or action guards that belong to the page being created now, prefer top-level `reaction.items[]` in that same blueprint rather than a second live-edit phase.
- If a create/edit form helper depends on `formValues.*`, prefer a helper host that belongs to that same form scene. If the live scene exposes `fields` / `actions` / `node` but not `blocks`, model the helper as a `jsItem` or other field-like helper rather than a separate sibling block.
- A first-pass miss is not enough to abandon whole-page authoring. Treat it as a blueprint-generation bug or whole-page contract problem to report, not as permission to switch routes mid-phase.
- If a whole-page `applyBlueprint` fails before first success, repair the blueprint from the error, rerun `prepare-write` and preview, and retry blueprint-only up to 5 rounds instead of dropping into low-level writes before success. After 5 failed rounds, report the latest blueprint / preview / error evidence.
- Only after one successful whole-page `applyBlueprint` may localized `add*` or `set*Rules` repair address an explicit residual local/live gap, and that repair should stay narrowly scoped.

## Default artifact-only output

For artifact-only drafting, write only under:

```text
.artifacts/nocobase-ui-builder/<scenario-id>/
```

Leave exactly:

- `blueprint.json`
- `prewrite-preview.txt`
- `readback-checklist.md`

If the prompt asks for `preview-policy.json` instead of `readback-checklist.md`, leave that requested three-file set. The policy shape is `{ "prepareWriteRequired": false, "previewSource": "draft-blueprint" }`.

For every artifact-only whole-page bundle, `blueprint.json` must be the bare blueprint root with top-level `tabs[]`; do not wrap it under `page`, `draft`, `blueprint`, `scenario`, `metadata`, or any explanatory envelope.

For artifact-only locator boundary handoffs, use `locator-map.json` with direct fields and non-empty placeholder strings:

```json
{ "navigation": { "routeId": "route-id-placeholder" }, "page": { "pageSchemaUid": "page-schema-placeholder" }, "liveTargets": [{ "role": "table", "uid": "live-target-uid-placeholder" }] }
```

Keep `liveTargets[].uid` as a non-empty placeholder when live readback has not happened yet, not `null`; it records the source class and still blocks downstream writes until real readback.

The checklist can stay short. It only needs to confirm create vs replace, one real tab by default, non-empty `tabs[]`, field truth from live `interface` facts when relevant, and that the preview came from the same blueprint draft.

## Minimal common-case blueprint

```json
{
  "version": "1",
  "mode": "create",
  "defaults": {
      "collections": {
        "support_tickets": {
          "popups": {
            "addNew": { "name": "Create ticket", "description": "Create one support ticket." },
            "view": { "name": "Ticket details", "description": "View one support ticket." },
            "edit": { "name": "Edit ticket", "description": "Edit one support ticket." },
            "associations": {
              "assignee": {
                "view": { "name": "Assignee details", "description": "View one related assignee." },
                "addNew": { "name": "Create assignee", "description": "Create one related assignee." },
                "edit": { "name": "Edit assignee", "description": "Edit one related assignee." }
              }
            }
          }
        }
    }
  },
  "navigation": {
    "group": { "title": "Workspace", "icon": "AppstoreOutlined" },
    "item": { "title": "Support tickets", "icon": "InboxOutlined" }
  },
  "page": { "title": "Support tickets" },
  "tabs": [
    {
      "key": "main",
      "title": "Overview",
      "blocks": [
        {
          "key": "ticketsTable",
          "type": "table",
          "collection": "support_tickets",
          "defaultFilter": {
            "logic": "$and",
            "items": [
              { "path": "subject", "operator": "$includes", "value": "" },
              { "path": "status", "operator": "$eq", "value": "" },
              { "path": "priority", "operator": "$eq", "value": "" }
            ]
          },
          "fields": ["subject", "status", "priority", "assignee"],
          "actions": ["filter", "addNew"],
          "recordActions": ["view", "edit"]
        }
      ]
    }
  ]
}
```

## Open next only if needed

- [blocks/filter-form.md](./blocks/filter-form.md) if the page explicitly asks for a filter/search block, form, query area, or screening form and you need the real filter-form completion contract
- [popup.md](./popup.md) if the page needs inline popup structure or custom edit/view popup composition
- [whole-page-recipes.md](./whole-page-recipes.md) for reusable whole-page blueprint patterns with paired blocks, nested popups, and top-level reactions
- [page-archetypes.md](./page-archetypes.md) if none of the common page shapes fits cleanly
- [page-blueprint.md](./page-blueprint.md) for the full page grammar, uncommon block shapes, or exact field / action structures
- [ascii-preview.md](./ascii-preview.md) for preview-only rendering details
- [helper-contracts.md](./helper-contracts.md) for real-write or prepare-write helper details
- [template-quick.md](./template-quick.md) if popup / block / fields reuse, existing template references, or `copy` vs `reference` is actually in scope
- [reaction-quick.md](./reaction-quick.md) if the page needs detailed reaction payload recipes
- [js.md](./js.md) if JS, charts, or `ctx.*` enters the page

For artifact-only drafting, you usually do not need [page-blueprint.md](./page-blueprint.md), [ascii-preview.md](./ascii-preview.md), [helper-contracts.md](./helper-contracts.md), or [tool-shapes.md](./tool-shapes.md).
For benchmark-style management pages with paired filters / tables / forms, you usually also do not need [page-blueprint.md](./page-blueprint.md) or [tool-shapes.md](./tool-shapes.md) before the first draft. Stay on this file plus [blocks/filter-form.md](./blocks/filter-form.md), [popup.md](./popup.md), and [reaction-quick.md](./reaction-quick.md) unless one concrete shape is still unresolved.

## Switch away when

- the request is really a localized change on an existing live page -> [local-edit-quick.md](./local-edit-quick.md)
- the request is mostly default values / linkage / state rules on an existing page -> [reaction-quick.md](./reaction-quick.md)
