# Whole-page Quick Route

Use this file as the default first stop for whole-page `create` / `replace` work.

Stay on this route when the user is asking for a full page or one route-backed tab, not a small patch on an existing live surface.

## Common-case flow

1. Pick the simplest page shape directly:
   - management page with explicit filter/search/screening intent -> read [blocks/filter-form.md](./blocks/filter-form.md) and keep a real `filterForm` in the same blueprint
   - management page without explicit screening -> table or filter-form + table
   - detail page -> details block, maybe one related table
   - dashboard -> summary, charts, light actions
   - portal / static page -> markdown, iframe, `jsBlock`, or `actionPanel`
2. Default a normal request to exactly one real tab.
3. Collect live collection metadata before choosing fields. Any field used in the blueprint should come from live metadata and should have a non-empty `interface`.
   - On every whole-page draft, recompute the involved target collections from that live metadata and rebuild `defaults.collections` from scratch instead of patching an old fragment.
   - For whole-page popup defaults, generate top-level `defaults.collections.<collection>.fieldGroups` only when the backend-generated popup should still have more than 10 effective fields after scene filtering; for 10 or fewer, omit `fieldGroups`.
   - Keep `fieldGroups` on the target collection only. Generate default popup names under `defaults.collections.<collection>.popups.view` / `addNew` / `edit`, and relation-field popup names under `defaults.collections.<sourceCollection>.popups.associations.<associationField>.<action>`.
   - Keep defaults name-only and collection-level: do not generate `defaults.blocks`, and do not put `blocks`, `fields`, `fieldGroups`, or layout inside `popups`.
4. For fresh page creation under a menu group, default to one whole-page `applyBlueprint` `create` write. Do not split the work into low-level `create-menu` + `create-page` unless `applyBlueprint create` has already failed with a verified shape problem.
5. For `create`, any newly created `navigation.group` and any top-level or second-level `navigation.item` must include one valid semantic Ant Design icon. When `navigation.item` is attached under one explicit existing `navigation.group.routeId`, keep an icon by default but do not assume the local preview can prove whether that live target is already third-level or deeper.
6. If visible same-title menu groups already exist, do not pick one locally and do not create another same-title group just to disambiguate. Require explicit `navigation.group.routeId` before the write whenever title lookup would hit multiple groups.
7. When the page is being created now, keep structure, popup, and whole-page interaction logic in the same blueprint:
   - root blocks in `tabs[].blocks[]`
   - popup content inline under the owning field/action/record action
   - interaction logic in top-level `reaction.items[]`
8. If the page explicitly asks for filtering, keep a real `filterForm` in that first-pass blueprint:
   - add non-empty filter `fields`
   - when the filter has fewer than 4 fields, add `actions: ["submit", "reset"]`
   - when the filter has 4 or more fields, add `actions: ["submit", "reset", "collapse"]`
   - point each filter field `target` at a same-blueprint table key as a plain string block key
   - if the page has one filter for `users` and one for `roles`, keep both `filterForm` blocks in the same first layout row and let each field target only its own same-blueprint table key
   - do not push `defaultTargetUid`, `filterManager`, or block-level `fields` / `actions` into raw `settings`
9. If one tab or popup contains multiple non-filter blocks, give it explicit `layout` and avoid one-row-one-block stacking. Filter blocks should sit alone in the first row when they are present.
   - For `createForm`, `editForm`, `details`, or `filterForm`, use block-level `fieldsLayout` when the draft must control the inner field grid directly.
   - For `createForm`, `editForm`, or `details`, once the block has more than 10 real fields, replace flat `fields[]` authoring with explicit `fieldGroups`.
   - `fieldGroups` and `fieldsLayout` must not be combined, and manual `divider` entries do not satisfy the large-form grouping rule.
10. Keep popup semantics close to the opener:
   - relation-field click-to-open -> prefer field popup
   - explicit operation button -> prefer action / record-action popup
   - custom edit popup -> keep exactly one `editForm` block in that popup
11. After any create/init step, normalize locators before follow-up reads or localized writes:
   - keep menu placement on `routeId` only
   - use `pageSchemaUid` for `nocobase-ctl flow-surfaces get`
   - use live `uid` values returned by `get` / `describe-surface` / create responses for `catalog`, `context`, `get-reaction-meta`, `compose`, `configure`, `add*`, and `remove*`
   - never pass a desktop-route `id` as `target.uid`
12. For normal local drafting or artifact-only tasks, stay on this file. Do not enumerate the skill directory or open helper/runtime docs just to reconfirm the route.
13. For artifact-only drafts, do not open [helper-contracts.md](./helper-contracts.md); draft the preview/checklist directly from the blueprint. Open it only when preparing a real write or running the local prewrite gate.
14. Open [tool-shapes.md](./tool-shapes.md) only when you are preparing the exact CLI body or MCP fallback envelope.
15. For the common nested-popup pattern used by real builds, open [popup.md](./popup.md) directly instead of searching the whole references tree.

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
- A first-pass miss is not enough to abandon whole-page authoring. Treat it as either:
  - a blueprint-generation bug in the skill, or
  - a public whole-page contract gap that still needs proof
- Only move to low-level `add*` or localized `set*Rules` after the failure proves the public whole-page contract cannot satisfy the request.

## Default artifact-only output

For artifact-only drafting, write only under:

```text
.artifacts/nocobase-ui-builder/<scenario-id>/
```

Leave exactly:

- `blueprint.json`
- `prewrite-preview.txt`
- `readback-checklist.md`

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
          "addNew": { "name": "Create ticket" },
          "view": { "name": "Ticket details" },
          "edit": { "name": "Edit ticket" },
          "associations": {
            "assignee": {
              "view": { "name": "Assignee details" }
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
          "fields": ["subject", "status", "assignee"],
          "actions": ["addNew"],
          "recordActions": ["view", "edit"]
        }
      ]
    }
  ]
}
```

## Open next only if needed

- [blocks/filter-form.md](./blocks/filter-form.md) if the page explicitly asks for filtering / search / screening and you need the real filter-form completion contract
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
