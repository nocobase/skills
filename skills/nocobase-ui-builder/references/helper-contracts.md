# Helper Contracts

Use this file only once whole-page routing is already settled and the task has reached the real write or local prewrite-validation stage.

If the task only needs local blueprint / preview artifacts or common-case drafting, stay in [whole-page-quick.md](./whole-page-quick.md) and do not open runtime source files.

## `nb-page-preview --prepare-write`

Use this before the first real whole-page write.

- CLI from repo root: `node skills/nocobase-ui-builder/runtime/bin/nb-page-preview.mjs --stdin-json --prepare-write`
- If your current directory is not the repo root, use the absolute path to `skills/nocobase-ui-builder/runtime/bin/nb-page-preview.mjs`; do not probe the bare `nb-page-preview` command first.
- input: one page blueprint JSON document, or the helper envelope `{ blueprint, templateDecision?, collectionMetadata? }`; `collectionMetadata` is required when the blueprint contains any data-bound block
- returns: normalized prepare-write result including prepared `cliBody` plus the ASCII preview
- treat the normalized write body as authoritative local write shape; expected helper-added or helper-normalized fields should be kept as-is instead of being locally undone
- once this helper has run successfully, the first whole-page write must consume `result.cliBody` rather than reusing the original draft blueprint
- this helper is local/read-only; it does not call `nb` or perform the remote write for you
- does not fetch live collection metadata by itself
- `collectionMetadata` stays caller-supplied; prepare-write does not fetch it for you
- for any data-bound block (a block with `collection`, `resource`, `binding`, `dataSourceKey`, `associationPathName`, or `associationField`), missing or empty `collectionMetadata` fails with `missing-collection-metadata`
- accepts omitted `table` / `list` / `gridCard` / `calendar` / `kanban` `filter` actions, but every direct non-template public `table` / `list` / `gridCard` / `calendar` / `kanban` block must still include a non-empty block-level `defaultFilter`; `{}`, `null`, and `{ logic: "$and", items: [] }` are rejected; when metadata exposes 3 or more suitable business fields, that block-level `defaultFilter` must cover at least 3 common fields, otherwise it must cover every available candidate; explicit `filterableFieldNames` are checked against action-level `settings.defaultFilter` when present, otherwise block-level `defaultFilter`
- when a block has `settings.height` but omits `settings.heightMode`, prepare-write adds `settings.heightMode: "specifyValue"` in `result.cliBody`; explicit `defaultHeight`, `fullHeight`, or `specifyValue` is preserved
- with `collectionMetadata`, validates fixed defaults completeness for every involved scope: missing `defaults.collections.<collection>`, required popup `{ name, description }` entries for the fixed `view` / `addNew` / `edit` trio, and required `fieldGroups` when any fixed generated popup scene still has more than 10 effective fields; any `table` block also pulls its collection into the `addNew` threshold check
- relation popup defaults stay keyed by the first relation segment; when callers pass deeper `popups.associations` keys such as `department.manager`, prepare-write normalizes them to that first segment in `result.cliBody`, and the explicit one-level key wins if both forms are present
- explicit local `popup.blocks` still participate in defaults scope collection even when `popup.template` or `popup.tryTemplate` is present; template binding only changes popup content sourcing, not defaults scope registration
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
- when a localized write sets `changes.height` or block `settings.height` without an explicit `heightMode`, this helper adds `heightMode: "specifyValue"` to `result.cliBody`; explicit modes are preserved
- tree `connectFields` checks run here too: `titleField` is display-only, selected values come from the tree key / `filterTargetKey`, incompatible target `filterPaths` fail with `tree-connect-filter-path-type-mismatch`, and live `targetId` / `targetBlockUid` writes require caller-supplied `liveTopology` plus collection metadata for the source tree and every target
- localized `kanban` main blocks reject `fieldGroups`, `fieldsLayout`, and `recordActions`; localized `calendar` main blocks reject `fields`, `fieldGroups`, and `recordActions`
- once this helper succeeds, keep the later write explicit; send only `result.cliBody` as the real low-level nb body

## `prepareApplyBlueprintRequest(...)`

Use this helper in local JS code when you need the same prepare-write behavior without shelling out.

- input: one page blueprint document, or the helper envelope `{ blueprint, templateDecision?, collectionMetadata? }`; provide `collectionMetadata` for data-bound blueprints
- returns: normalized prepare-write result with prepared `cliBody`, preview, and local validation output
- accept expected helper-added and helper-normalized output as-is instead of trying to undo it locally
- use it for: prewrite validation, preview generation, template-decision normalization, required data-bound `collectionMetadata` checks, and defaults completeness checks
- do not treat it as a transport wrapper; if it succeeds, persist/inspect `result.cliBody` if needed and send only that prepared object in the later `nb api flow-surfaces apply-blueprint` call
- do not use it as a schema-aware planner; recompute involved collections and rebuild `defaults.collections` before calling it

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
