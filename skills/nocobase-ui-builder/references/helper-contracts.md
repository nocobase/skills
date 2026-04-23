# Helper Contracts

Use this file only once whole-page routing is already settled and the task has reached the real write or local prewrite-validation stage.

If the task only needs local blueprint / preview artifacts or common-case drafting, stay in [whole-page-quick.md](./whole-page-quick.md) and do not open runtime source files.

## `nb-page-preview --prepare-write`

Use this before the first real whole-page write.

- CLI from repo root: `node skills/nocobase-ui-builder/runtime/bin/nb-page-preview.mjs --stdin-json --prepare-write`
- If your current directory is not the repo root, use the absolute path to `skills/nocobase-ui-builder/runtime/bin/nb-page-preview.mjs`; do not probe the bare `nb-page-preview` command first.
- input: one page blueprint JSON document, or the helper envelope `{ requestBody, templateDecision?, collectionMetadata? }`
- returns: normalized prepare-write result including prepared `cliBody` plus the ASCII preview
- treat the normalized write body as authoritative local write shape; expected helper-added or helper-normalized fields should be kept as-is instead of being locally undone
- once this helper has run successfully, the first whole-page write must consume `result.cliBody` rather than reusing the original draft blueprint
- this helper is local/read-only; it does not call `nocobase-ctl` or perform the remote write for you
- does not fetch live collection metadata by itself
- `collectionMetadata` stays caller-supplied; prepare-write does not fetch it for you
- accepts omitted `table` / `list` / `gridCard` `filter` actions, but every direct non-template public `table` / `list` / `gridCard` block must still include block-level `defaultFilter`; `{}` / `{ logic: "$and", items: [] }` are valid empty groups, and explicit `filterableFieldNames` are checked against action-level `settings.defaultFilter` when present, otherwise block-level `defaultFilter`
- when `collectionMetadata` is provided, validates fixed defaults completeness for every involved scope: missing `defaults.collections.<collection>`, required popup `{ name, description }` entries for the fixed `view` / `addNew` / `edit` trio, and required `fieldGroups` when any fixed generated popup scene still has more than 10 effective fields; any `table` block also pulls its collection into the `addNew` threshold check
- relation popup defaults stay keyed by the first relation segment; when callers pass deeper `popups.associations` keys such as `department.manager`, prepare-write normalizes them to that first segment in `result.cliBody`, and the explicit one-level key wins if both forms are present
- explicit local `popup.blocks` still participate in defaults scope collection even when `popup.template` or `popup.tryTemplate` is present; template binding only changes popup content sourcing, not defaults scope registration
- when that defaults-completeness work is required but `collectionMetadata` is missing or normalizes to no collections, prepare-write returns `defaultsRequirements.skipped=true` and skips completeness validation instead of failing
- rejects: common high-risk write-shape mistakes before the remote write

## `prepareApplyBlueprintRequest(...)`

Use this helper in local JS code when you need the same prepare-write behavior without shelling out.

- input: one page blueprint document, or the helper envelope `{ requestBody, templateDecision?, collectionMetadata? }`
- returns: normalized prepare-write result with prepared `cliBody`, preview, and local validation output
- accept expected helper-added and helper-normalized output as-is instead of trying to undo it locally
- use it for: prewrite validation, preview generation, template-decision normalization, and caller-supplied `collectionMetadata` completeness checks
- do not treat it as a transport wrapper; if it succeeds, persist/inspect `result.cliBody` if needed and send only that prepared object in the later `nocobase-ctl flow-surfaces apply-blueprint` call
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
