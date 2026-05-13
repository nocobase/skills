# Helper Contracts

Use this file only for optional local helpers that do not define the write path. Backend `nb api flow-surfaces <action>` writes are the authoring compiler and safety gate.

If the task only needs local blueprint artifacts or common-case drafting, stay in [whole-page-quick.md](./whole-page-quick.md) and do not open runtime source files.

## Deprecated local write gates

Legacy PrepareWrite and localized validation gates are no longer required or recommended before writes.

- agent-facing write path: `nb api flow-surfaces <action>`
- input: one raw business payload, sent through `--body` / `--body-file`
- backend result: successful normalized persisted write, or aggregate `errors[]` with stable locations and rule ids
- backend authoring resolves compatible `navigation.group.title` cases against live `desktopRoutes`: zero matches create, one match can normalize to `routeId`, and multiple matches require explicit `routeId`
- backend authoring reads live metadata/topology/template context where needed; callers should still plan from current metadata before writing
- backend authoring strips redundant persisted block title chrome for single-scope direct non-template `table` / `list` / `gridCard` / `calendar` / `kanban` data blocks, while multi-block scopes preserve explicit data-block titles for layout clarity
- accepts omitted `table` / `list` / `gridCard` / `calendar` / `kanban` `filter` actions and omitted direct non-template `defaultFilter`; backend authoring materializes a default filter from live metadata with up to 4 scalar/filterable fields. Explicit `{}`, `null`, and `{ logic: "$and", items: [] }` are rejected through aggregate `errors[]`; invalid operators, relation fields used directly, unknown paths, and filters with fewer fields than the smaller of 3 and the collection's eligible direct interface-field count are rejected too. Use scalar fields or relation child paths such as `department.title`. Explicit `filterableFieldNames` are checked against the effective default filter: filter action `settings.defaultFilter` when present, then `defaultActionSettings.filter.defaultFilter`, then block-level `defaultFilter`, otherwise the backend-generated default filter.
- merges partial default block actions by action type: for every direct public data surface, partial `actions` complete to that host's defaults (`filter` / `refresh` / `addNew`, plus table `bulkDelete`), table partial `recordActions` complete to `view` / `edit` / `delete`, and explicit same-type entries keep their settings
- validates update-action `settings.assignValues`: `bulkUpdate` must be under block `actions`, `updateRecord` under `recordActions`, `assignValues` must be a plain object, `{}` is allowed, and non-empty keys must exist in the host collection metadata
- relation field display objects stay ID-safe: when the target collection's effective `titleField` resolves to `id`, backend authoring should auto-fill a readable `titleField` when metadata exposes one, reject explicit unsafe `id`, and fail closed when no readable display field exists
- for sortable public blocks (`table`, `details`, `list`, `tree`, `kanban`, `gridCard`, `map`), `settings.sort` is accepted only as a compatibility alias and is normalized to canonical `settings.sorting`; resource-style strings such as `"-createdAt"` are accepted, and conflicting `sort` and `sorting` fail
- when a block has `settings.height` but omits `settings.heightMode`, backend authoring adds `settings.heightMode: "specifyValue"`; explicit `defaultHeight`, `fullHeight`, or `specifyValue` is preserved
- builder chart relation field paths fail through backend aggregate validation with `CHART_BUILDER_RELATION_FIELD_RUNTIME_UNSUPPORTED` / `chart-builder-relation-field-runtime-unsupported`: `assets.charts.*.query.measures[]`, `dimensions[]`, `sorting[]`, and `orders[]` must use scalar fields. Use SQL chart with an explicit join for relation-label grouping, or use a scalar foreign key only when ID display is acceptable.
- semantic field bindings remain strict: backend authoring may normalize shape and compatibility aliases, but it must not replace an invalid `calendar` / `kanban` field binding with a guessed fallback field. Invalid `titleField`, `colorField`, `startField`, `endField`, or explicit `groupField` fail.
- relation field popup content is validated with collection metadata: `details` / `editForm` must bind to `resource.binding = "currentRecord"` for the clicked related record; a legacy collection-only `details` / `editForm` popup is normalized only when its collection matches the relation target; relation tables/lists/cards must use `resource.binding = "associatedRecords"` with `resource.associationField`
- with resolved `collectionMetadata`, validates fixed defaults completeness for every involved scope, including explicit blocks inside calendar/kanban hidden popup hosts: missing `defaults.collections.<collection>`, required popup `{ name, description }` entries for the fixed `view` / `addNew` / `edit` trio, and required `fieldGroups` when any fixed generated popup scene still has more than 10 effective fields; any `table` block also pulls its collection into the `addNew` threshold check
- when metadata is available and the collection popup descriptors exist, backend authoring rejects missing or invalid collection-level `defaults.collections.<collection>.fieldGroups` for large generated popups that cannot be safely materialized; callers regenerate explicit semantic groups from live metadata
- relation popup defaults stay keyed by the first relation segment; when callers pass deeper `popups.associations` keys such as `department.manager`, backend authoring normalizes them to that first segment, and the explicit one-level key wins if both forms are present
- explicit local `popup.blocks` and `settings.quickCreatePopup` / `settings.eventPopup` / `settings.cardPopup` blocks still participate in defaults scope collection even when `popup.template` or `popup.tryTemplate` is present; template binding only changes popup content sourcing, not defaults scope registration
- rejects: common high-risk write-shape mistakes before the remote write

## Historical localized prevalidation notes

These notes document checks that now belong in backend authoring validation for localized `compose`, `add-block`, `add-blocks`, or `configure` bodies.

- input: one localized write body object, or helper envelope `{ body, collectionMetadata? }`
- backend returns stable aggregate `errors[]`, warnings when applicable, and persisted normalized state
- use backend validation for localized public low-level `compose` / `add-block` / `add-blocks` / `configure` bodies
- the agent-facing path is `nb api flow-surfaces <action>`
- `collectionMetadata` stays caller-supplied; this helper does not fetch it for you
- for any data-bound localized payload, missing or empty metadata should be handled by backend metadata reads or returned as a stable aggregate error
- direct non-template public `table` / `list` / `gridCard` / `calendar` / `kanban` blocks may omit `defaultFilter`; backend authoring materializes one from collection metadata with 4 generated filter fields
- metadata-aware explicit `defaultFilter` checks now belong to backend authoring: empty groups, unknown paths, relation fields used directly, invalid operators, non-filter action `settings.defaultFilter` / `filterableFieldNames`, and explicit `filterableFieldNames` coverage mismatches return aggregate `errors[]`. Historical `defaultActionSettings.filter.defaultFilter` inputs remain compatibility-normalized where supported; prefer block-level or filter action settings only when overriding generated defaults.
- metadata-aware update-action `settings.assignValues` checks run here too: `bulkUpdate` belongs in `actions`, `updateRecord` belongs in `recordActions`, `assignValues` must be a plain object, `{}` clears values, and non-empty keys must exist in the target collection metadata
- relation field display objects keep the same ID-safe guard here too: if the target collection's effective `titleField` resolves to `id`, backend authoring first auto-fills a readable `titleField` when metadata exposes one; explicit `titleField: "id"` is rejected, and backend authoring fails closed when the target exposes no readable display field
- when a localized write sets `changes.height` or block `settings.height` without an explicit `heightMode`, backend authoring adds `heightMode: "specifyValue"`; explicit modes are preserved
- localized chart builder relation field paths fail through backend aggregate validation with `CHART_BUILDER_RELATION_FIELD_RUNTIME_UNSUPPORTED` / `chart-builder-relation-field-runtime-unsupported` for `settings.query` and live chart `configure.changes.query`; use SQL chart with an explicit join for relation-label grouping, or use a scalar foreign key only when ID display is acceptable
- localized sortable public block (`table`, `details`, `list`, `tree`, `kanban`, `gridCard`, `map`) `settings.sort` is normalized to canonical `settings.sorting`; localized `configure.changes.sort` is normalized only when live topology proves the target is one of those sortable block uses; `calendar` is left unchanged; conflicting `sort` and `sorting` fail
- when localized `configure` resolves `target.uid` to a known public host, backend authoring reuses that live host context for `$.changes.*` validation too: hidden popup settings and nested hidden popup `blocks`, block-level `defaultFilter`, relation field popup child `resource.binding`, unsupported `calendar` / `kanban` main-block sections, strict `calendar` / `kanban` semantic field bindings, chart `displayTitle`, and internal public field object restrictions are all checked against that host-aware context
- unknown or unmapped localized `configure` targets keep the older compatibility-tolerant path for host-specific validators; the stricter `$.changes.*` checks above apply only when live topology proves the target host
- localized relation field popup content is also validated: `details` / `editForm` are `currentRecord` for the clicked related record, legacy matching collection-only blocks are normalized to that binding, and relation `table` / `list` / `gridCard` blocks must use `associatedRecords` plus the relation `associationField`
- tree `connectFields` checks run here too: `titleField` is display-only, selected values come from the tree key / `filterTargetKey`, incompatible target `filterPaths` fail with `tree-connect-filter-path-type-mismatch`, and live `targetId` / `targetBlockUid` writes require caller-supplied `liveTopology` plus collection metadata for the source tree and every target
- localized `kanban` main blocks reject `fieldGroups`, `fieldsLayout`, and `recordActions`; localized `calendar` main blocks reject `fields`, `fieldGroups`, and `recordActions`
- calendar and kanban hidden popup template choices follow the hidden popup rules in [page-blueprint.md](./page-blueprint.md): use calendar `settings.quickCreatePopup` / `settings.eventPopup` and kanban `settings.quickCreatePopup` / `settings.cardPopup`, not main-block `popup.template`; backend validates those hidden popup settings when present
- backend validation recurses into explicit hidden popup `blocks`, so nested public data-surface blocks, relation field popups, metadata requirements, and `calendar` / `kanban` semantic field bindings are validated there too

## `nb-runjs validate --skill-mode`

Use this when the task is JS / RunJS specific and you need local validation.

Before you run it, lock the authoring surface in [js-surfaces/index.md](./js-surfaces/index.md), fill the loop in [runjs-authoring-loop.md](./runjs-authoring-loop.md), and choose a canonical snippet from [js-snippets/catalog.json](./js-snippets/catalog.json). The validator contract now differs between render-style JS models, action-style event/linkage code, and value-return RunJS.

- CLI from repo root: `node skills/nocobase-ui-builder/runtime/bin/nb-runjs.mjs validate --stdin-json --skill-mode`
- input: `{ model, code, context? }`
- returns: validation result, policy issues, and execution summary
- use it for: JS blocks, JS fields, JS actions, and event-flow `Execute JavaScript` snippets
- if it fails: repair with [runjs-repair-playbook.md](./runjs-repair-playbook.md) and retry at most 3 rounds
