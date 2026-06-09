# Helper Contracts

Use this file only for optional local helpers and common write behavior.

If the task only needs local blueprint artifacts or common-case drafting, stay in [whole-page-quick.md](./whole-page-quick.md) and do not open runtime source files.

## Write Behavior

Send one raw business payload through `nb api flow-surfaces <action>`. If the response returns `errors[]`, repair the listed issues and retry the raw payload. Optional helpers are local/read-only aids: they do not execute `nb`, do not wrap the transport, and do not prepare a required write payload.

- agent-facing write path: `nb api flow-surfaces <action>`
- input: one raw business payload, sent through `--body` / `--body-file`
- backend result: successful normalized persisted write, or aggregate `errors[]` with stable locations and rule ids
- backend authoring resolves compatible `navigation.group.title` cases against live `desktopRoutes`: zero matches create, one match can normalize to `routeId`, and multiple matches require explicit `routeId`
- backend authoring reads live metadata, topology, and template context where needed; callers should still plan from current metadata before writing
- backend authoring strips redundant persisted block title chrome for single-scope direct non-template `table` / `list` / `gridCard` / `calendar` / `kanban` data blocks, while multi-block scopes preserve explicit data-block titles for layout clarity
- accepts omitted `table` / `list` / `gridCard` / `calendar` / `kanban` `filter` actions and omitted direct non-template `defaultFilter`; backend authoring materializes a default filter from live metadata with up to 4 scalar/filterable fields. Explicit `{}`, `null`, and `{ logic: "$and", items: [] }` are rejected through aggregate `errors[]`; invalid operators, relation fields used directly, unknown paths, and filters with fewer fields than the smaller of 3 and the collection's eligible direct interface-field count are rejected too. Use scalar fields or relation child paths such as `department.title`. Explicit `filterableFieldNames` are checked against the effective default filter: filter action `settings.defaultFilter` when present, then `defaultActionSettings.filter.defaultFilter`, then block-level `defaultFilter`, otherwise the backend-generated default filter.
- merges partial default block actions by action type: for every direct public data surface, partial `actions` complete to that host's defaults (`filter` / `refresh` / `addNew`, plus table `bulkDelete`), ordinary table partial `recordActions` complete to `view` / `edit` / `delete`, tree table partial `recordActions` are not completed with `view` / `edit` / `delete`, and explicit same-type entries keep their settings
- validates update-action `settings.assignValues`: `bulkUpdate` must be under block `actions`, `updateRecord` under `recordActions`, `assignValues` must be a plain object, `{}` is allowed, and non-empty keys must exist in the host collection metadata
- validates submit/update-record workflow bindings through public `settings.triggerWorkflows` or `configure.changes.triggerWorkflows`: only form submit and record `updateRecord` actions support it, each row is `{ workflowKey, context? }`, `[]` clears bindings, `null` is invalid, and workflow existence/enabled state is not checked during authoring
- relation field display objects stay ID-safe: when the target collection's effective `titleField` resolves to `id`, backend authoring should auto-fill a readable `titleField` when metadata exposes one, reject explicit unsafe `id`, and fail closed when no readable display field exists
- for sortable public blocks (`table`, `details`, `list`, `tree`, `kanban`, `gridCard`, `map`), `settings.sort` is accepted only as a compatibility alias and is normalized to canonical `settings.sorting`; `calendar` sort aliases are left unchanged; resource-style strings such as `"-createdAt"` are accepted, and conflicting `sort` and `sorting` fail
- when a block has `settings.height` but omits `settings.heightMode`, backend authoring adds `settings.heightMode: "specifyValue"`; explicit `defaultHeight`, `fullHeight`, or `specifyValue` is preserved
- builder chart direct association fields fail through backend aggregate validation with `chart-builder-query-association-field-requires-subfield`: `assets.charts.*.query.measures[]` and `dimensions[]` should use scalar fields or the backend-suggested scalar subfield from `details.suggestedFieldPath`. For relation-label grouping that needs joins or custom label logic, use SQL chart with an explicit join; use a scalar foreign key only when ID display is acceptable.
- semantic field bindings remain strict: backend authoring may normalize shape and compatibility aliases, but it must not replace an invalid `calendar` / `kanban` field binding with a guessed fallback field. Invalid `titleField`, `colorField`, `startField`, `endField`, or explicit `groupField` fail.
- relation field popup content is validated with collection metadata: `details` / `editForm` must bind to `resource.binding = "currentRecord"` for the clicked related record; a legacy collection-only `details` / `editForm` popup is normalized only when its collection matches the relation target; relation tables/lists/cards must use `resource.binding = "associatedRecords"` with `resource.associationField`
- with resolved `collectionMetadata`, validates fixed defaults completeness for every involved scope, including explicit blocks inside calendar/kanban hidden popup hosts: missing `defaults.collections.<collection>`, required popup `{ name, description }` entries for the fixed `view` / `addNew` / `edit` trio, required `fieldGroups` when any fixed generated popup scene still has more than 10 effective fields, and description-derived generated add/edit coverage where every described generated add/edit field must be covered by structured `defaults.collections.<collection>.formBehavior` or reviewed once under sibling `formBehaviorDescriptionReview.fields.<field>` with `decision: "implemented"`, `"noUiBehavior"`, or `"unsupported"`; `implemented` must match real structured coverage, non-implemented decisions require a valid `reasonCode`, old `fields[]` / `hasTried` is rejected, and any `table` block also pulls its collection into the `addNew` threshold check
- when metadata is available and the collection popup descriptors exist, backend authoring rejects missing or invalid collection-level `defaults.collections.<collection>.fieldGroups` for large generated popups that cannot be safely materialized; callers regenerate explicit semantic groups from live metadata
- relation popup defaults stay keyed by the first relation segment; when callers pass deeper `popups.associations` keys such as `department.manager`, backend authoring normalizes them to that first segment, and the explicit one-level key wins if both forms are present
- explicit local `popup.blocks` and `settings.quickCreatePopup` / `settings.eventPopup` / `settings.cardPopup` blocks still participate in defaults scope collection even when `popup.template` or `popup.tryTemplate` is present; template binding only changes popup content sourcing, not defaults scope registration
- rejects: common high-risk write-shape mistakes before the remote write

## `nb-template-decision`

Use this only when template reuse/copy/reference choice is unclear and a local planning summary is useful.

- CLI from repo root: `node skills/nocobase-ui-builder/runtime/bin/nb-template-decision.mjs plan-query --stdin-json`
- input: template intent, repeat eligibility, current host context, and search terms
- returns: planning guidance for template search/reuse; final writes still go through `nb api flow-surfaces <action>`
- template binding details stay in [templates.md](./templates.md) and [template-decision-summary.md](./template-decision-summary.md)
