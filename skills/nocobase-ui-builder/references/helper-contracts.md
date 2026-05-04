# Helper Contracts

Use this file only once whole-page routing is already settled and the task has reached the real write or local prewrite-validation stage.

If the task only needs local blueprint / preview artifacts or common-case drafting, stay in [whole-page-quick.md](./whole-page-quick.md) and do not open runtime source files.

## `nb-page-preview --prepare-write`

Use this before the first real whole-page write.

- CLI from repo root: `node skills/nocobase-ui-builder/runtime/bin/nb-page-preview.mjs --stdin-json --prepare-write`
- If your current directory is not the repo root, use the absolute path to `skills/nocobase-ui-builder/runtime/bin/nb-page-preview.mjs`; do not probe the bare `nb-page-preview` command first.
- input: one page blueprint JSON document, or the helper envelope `{ blueprint, templateDecision?, collectionMetadata? }`; keep `collectionMetadata` outside the blueprint root
- returns: normalized prepare-write result including prepared `cliBody` plus the ASCII preview
- treat the normalized write body as authoritative local write shape; expected helper-added or helper-normalized fields should be kept as-is instead of being locally undone
- once this helper has run successfully, the first whole-page write must consume `result.cliBody` rather than reusing the original draft blueprint
- this helper is local/read-only for page writes; it never performs the remote `apply-blueprint` write for you
- by default, in `create` mode it also resolves `navigation.group.title` against live `desktopRoutes`: zero matches keep `title + icon` for new-group creation, one match rewrites the prepared `cliBody` to `navigation.group.routeId`, and multiple matches fail locally requiring explicit `routeId`
- by default, the CLI path auto-resolves missing `collectionMetadata` entries before validation: it normalizes supplied metadata, scans data-bound blocks, ordinary popups, and calendar/kanban hidden popup hosts, resolves association targets from known metadata for up to 5 rounds, fetches only missing collections with `nb api data-modeling collections get --filter-by-tk <collection> --appends fields -j`, and falls back to `nb api resource list --resource collections --filter '{"name":"<collection>"}' --appends fields -j`
- caller-supplied `collectionMetadata` wins; fetched metadata only fills missing collection entries and is not emitted in `result.cliBody`
- pass `--no-auto-collection-metadata` to keep fail-closed behavior; then any data-bound block (a block with `collection`, `resource`, `binding`, `dataSourceKey`, `associationPathName`, or `associationField`) with missing or empty metadata fails with `missing-collection-metadata`
- accepts omitted `table` / `list` / `gridCard` / `calendar` / `kanban` `filter` actions, but every direct non-template public `table` / `list` / `gridCard` / `calendar` / `kanban` block must still include a non-empty block-level `defaultFilter`; `{}`, `null`, and `{ logic: "$and", items: [] }` are rejected; when metadata exposes 3 or more suitable business fields, that block-level `defaultFilter` must cover at least 3 common fields, otherwise it must cover every available candidate; explicit `filterableFieldNames` are checked against action-level `settings.defaultFilter` when present, otherwise block-level `defaultFilter`
- validates update-action `settings.assignValues`: `bulkUpdate` must be under block `actions`, `updateRecord` under `recordActions`, `assignValues` must be a plain object, `{}` is allowed, and non-empty keys must exist in the host collection metadata
- for sortable public blocks (`table`, `details`, `list`, `tree`, `kanban`, `gridCard`, `map`), `settings.sort` is accepted only as a compatibility alias and is normalized to canonical `settings.sorting`; resource-style strings such as `"-createdAt"` are accepted, and conflicting `sort` and `sorting` fail locally. `calendar` does not support that alias path in applyBlueprint prepare-write: unsupported calendar settings such as `sort` are removed from `result.cliBody`
- when a block has `settings.height` but omits `settings.heightMode`, prepare-write adds `settings.heightMode: "specifyValue"` in `result.cliBody`; explicit `defaultHeight`, `fullHeight`, or `specifyValue` is preserved
- builder chart relation field paths fail locally with `CHART_BUILDER_RELATION_FIELD_RUNTIME_UNSUPPORTED` / `chart-builder-relation-field-runtime-unsupported`: `assets.charts.*.query.measures[]`, `dimensions[]`, `sorting[]`, and `orders[]` must use scalar fields. Use SQL chart with an explicit join for relation-label grouping, or use a scalar foreign key only when ID display is acceptable.
- semantic field bindings remain strict: prepare-write may normalize shape and compatibility aliases, but it does not replace an invalid `calendar` / `kanban` field binding with a guessed fallback field. Invalid `titleField`, `colorField`, `startField`, `endField`, or explicit `groupField` fail locally.
- relation field popup content is validated with collection metadata: `details` / `editForm` must bind to `resource.binding = "currentRecord"` for the clicked related record; a legacy collection-only `details` / `editForm` popup is normalized only when its collection matches the relation target; relation tables/lists/cards must use `resource.binding = "associatedRecords"` with `resource.associationField`
- with resolved `collectionMetadata`, validates fixed defaults completeness for every involved scope, including explicit blocks inside calendar/kanban hidden popup hosts: missing `defaults.collections.<collection>`, required popup `{ name, description }` entries for the fixed `view` / `addNew` / `edit` trio, and required `fieldGroups` when any fixed generated popup scene still has more than 10 effective fields; any `table` block also pulls its collection into the `addNew` threshold check
- when metadata is available and the collection popup descriptors exist, prepare-write rejects missing collection-level `defaults.collections.<collection>.fieldGroups` for large generated popups; it does not synthesize generic groups, so callers must regenerate explicit semantic groups from live metadata
- relation popup defaults stay keyed by the first relation segment; when callers pass deeper `popups.associations` keys such as `department.manager`, prepare-write normalizes them to that first segment in `result.cliBody`, and the explicit one-level key wins if both forms are present
- explicit local `popup.blocks` and `settings.quickCreatePopup` / `settings.eventPopup` / `settings.cardPopup` blocks still participate in defaults scope collection even when `popup.template` or `popup.tryTemplate` is present; template binding only changes popup content sourcing, not defaults scope registration
- rejects: common high-risk write-shape mistakes before the remote write

## `nb-localized-write-preflight`

Use this when you want a local validation pass for one localized `compose`, `add-block`, `add-blocks`, or `configure` body before the later explicit `nb api flow-surfaces ...` write.

- CLI from repo root: `node skills/nocobase-ui-builder/runtime/bin/nb-localized-write-preflight.mjs --operation <compose|add-block|add-blocks|configure> --stdin-json`
- If your current directory is not the repo root, use the absolute path to `skills/nocobase-ui-builder/runtime/bin/nb-localized-write-preflight.mjs`; do not probe the bare `nb-localized-write-preflight` command first.
- input: one localized write body object, or helper envelope `{ body, collectionMetadata? }`
- returns: stable localized preflight result with `ok`, `errors`, `warnings`, `facts`, and normalized `cliBody`
- use it for: local validation of localized public low-level `compose` / `add-block` / `add-blocks` / `configure` bodies before the later explicit `nb api flow-surfaces ...` call
- this helper is local/read-only: it validates and canonicalizes one payload, but does not execute `nb` and does not wrap the transport for you
- `collectionMetadata` stays caller-supplied; this helper does not fetch it for you
- for any data-bound localized payload, missing or empty metadata fails with stable helper rule id `missing-collection-metadata`
- direct non-template public `table` / `list` / `gridCard` / `calendar` / `kanban` blocks still fail closed here when block-level `defaultFilter` is missing or empty; this stricter requirement belongs to the skill preflight layer, not the backend runtime compatibility contract
- metadata-aware `defaultFilter` checks still run here: unknown paths, incomplete common-field coverage, and explicit action-level `settings.defaultFilter` or `defaultActionSettings.filter.defaultFilter` mismatches fail locally
- metadata-aware update-action `settings.assignValues` checks run here too: `bulkUpdate` belongs in `actions`, `updateRecord` belongs in `recordActions`, `assignValues` must be a plain object, `{}` clears values, and non-empty keys must exist in the target collection metadata
- when a localized write sets `changes.height` or block `settings.height` without an explicit `heightMode`, this helper adds `heightMode: "specifyValue"` to `result.cliBody`; explicit modes are preserved
- localized chart builder relation field paths fail locally with `CHART_BUILDER_RELATION_FIELD_RUNTIME_UNSUPPORTED` / `chart-builder-relation-field-runtime-unsupported` for `settings.query` and live chart `configure.changes.query`; use SQL chart with an explicit join for relation-label grouping, or use a scalar foreign key only when ID display is acceptable
- localized sortable public block (`table`, `details`, `list`, `tree`, `kanban`, `gridCard`, `map`) `settings.sort` is normalized to canonical `settings.sorting`; localized `configure.changes.sort` is normalized only when `collectionMetadata.liveTopology.byUid[target.uid]` proves the target is one of those sortable block uses; `calendar` is left unchanged; conflicting `sort` and `sorting` fail locally
- when localized `configure` resolves `target.uid` through `collectionMetadata.liveTopology.byUid` to a known public host, preflight reuses that live host context for `$.changes.*` validation too: hidden popup settings and nested hidden popup `blocks`, block-level `defaultFilter`, relation field popup child `resource.binding`, unsupported `calendar` / `kanban` main-block sections, strict `calendar` / `kanban` semantic field bindings, chart `displayTitle`, and internal public field object restrictions are all checked against that host-aware context
- unknown or unmapped localized `configure` targets keep the older compatibility-tolerant path for host-specific validators; the stricter `$.changes.*` checks above apply only when live topology proves the target host
- localized relation field popup content is also validated: `details` / `editForm` are `currentRecord` for the clicked related record, legacy matching collection-only blocks are normalized to that binding, and relation `table` / `list` / `gridCard` blocks must use `associatedRecords` plus the relation `associationField`
- tree `connectFields` checks run here too: `titleField` is display-only, selected values come from the tree key / `filterTargetKey`, incompatible target `filterPaths` fail with `tree-connect-filter-path-type-mismatch`, and live `targetId` / `targetBlockUid` writes require caller-supplied `liveTopology` plus collection metadata for the source tree and every target
- localized `kanban` main blocks reject `fieldGroups`, `fieldsLayout`, and `recordActions`; localized `calendar` main blocks reject `fields`, `fieldGroups`, and `recordActions`
- calendar and kanban hidden popup template choices follow the hidden popup rules in [page-blueprint.md](./page-blueprint.md): use calendar `settings.quickCreatePopup` / `settings.eventPopup` and kanban `settings.quickCreatePopup` / `settings.cardPopup`, not main-block `popup.template`; localized preflight validates those hidden popup settings when present, but it does not auto-fill missing calendar / kanban hidden popup objects with `tryTemplate=true`
- localized preflight also recurses into explicit hidden popup `blocks`, so nested public data-surface blocks, relation field popups, metadata requirements, and `calendar` / `kanban` semantic field bindings are validated there too
- hidden popup validation here still stops short of whole-page-only popup materialization, defaults completeness, or metadata auto-discovery behavior.
- once this helper succeeds, keep the later write explicit; send only `result.cliBody` as the real low-level nb body

## `prepareApplyBlueprintRequest(...)`

Use this helper in local JS code when you need the same prepare-write behavior without shelling out.

- input: one page blueprint document, or the helper envelope `{ blueprint, templateDecision?, collectionMetadata? }`; provide `collectionMetadata` in the envelope or options when you already have it
- returns: normalized prepare-write result with prepared `cliBody`, preview, and local validation output
- accept expected helper-added and helper-normalized output as-is instead of trying to undo it locally
- use it for: prewrite validation, preview generation, template-decision normalization, data-bound `collectionMetadata` checks, and defaults completeness checks
- do not treat it as a transport wrapper; if it succeeds, persist/inspect `result.cliBody` if needed and send only that prepared object in the later `nb api flow-surfaces apply-blueprint` call
- do not use it as a schema-aware planner; recompute involved collections and rebuild `defaults.collections` before calling it
- unlike the CLI, this JS helper does not auto-fetch missing metadata; pass resolved metadata explicitly when calling it directly

## `nb-page-preview` preview-only mode

Use this when you only need the ASCII wireframe and are **not** preparing the real write body yet.

- CLI from repo root: `node skills/nocobase-ui-builder/runtime/bin/nb-page-preview.mjs --stdin-json`
- input: one page blueprint JSON document
- returns: preview-only result
- do not use it as the first real write gate when `--prepare-write` is available

## `nb-runjs validate --skill-mode`

Use this when the task is JS / RunJS specific and you need local validation.

Before you run it, lock the authoring surface in [js-surfaces/index.md](./js-surfaces/index.md), fill the loop in [runjs-authoring-loop.md](./runjs-authoring-loop.md), and choose a canonical snippet from [js-snippets/catalog.json](./js-snippets/catalog.json). The validator contract now differs between render-style JS models, action-style event/linkage code, and value-return RunJS.

- CLI from repo root: `node skills/nocobase-ui-builder/runtime/bin/nb-runjs.mjs validate --stdin-json --skill-mode`
- input: `{ model, code, context? }`
- returns: validation result, policy issues, and execution summary
- use it for: JS blocks, JS fields, JS actions, and event-flow `Execute JavaScript` snippets
- if it fails: repair with [runjs-repair-playbook.md](./runjs-repair-playbook.md) and retry at most 3 rounds
