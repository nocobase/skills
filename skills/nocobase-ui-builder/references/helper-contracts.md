# Helper Contracts

Use this file only once whole-page routing is already settled and the task has reached the real write or local prewrite-validation stage.

If the task only needs local blueprint / preview artifacts or common-case drafting, stay in [whole-page-quick.md](./whole-page-quick.md) and do not open runtime source files.

## `nb-page-preview --prepare-write`

Use this before the first real whole-page write.

- CLI: `nb-page-preview --stdin-json --prepare-write`
- input: one page blueprint JSON document, or the helper envelope `{ requestBody, templateDecision?, collectionMetadata? }`
- returns: normalized CLI write body plus the ASCII preview
- treat the normalized write body as authoritative local write shape; expected helper-added or helper-normalized fields should be kept as-is instead of being locally undone
- does not fetch live collection metadata by itself
- when `collectionMetadata` is provided, validates defaults completeness for the involved collections: missing `defaults.collections.<collection>`, required `fieldGroups` for generated popups with more than 10 effective fields, and required popup `{ name, description }` entries for the actions actually used by the blueprint
- without `collectionMetadata`, that defaults-completeness check is skipped
- rejects: common high-risk write-shape mistakes before the remote write

## `prepareApplyBlueprintRequest(...)`

Use this helper in local JS code when you need the same prepare-write behavior without shelling out.

- input: one page blueprint document, or the helper envelope `{ requestBody, templateDecision?, collectionMetadata? }`
- returns: normalized prepare-write result with the blueprint body, preview, and local validation output
- accept expected helper-added and helper-normalized output as-is instead of trying to undo it locally
- use it for: prewrite validation, preview generation, template-decision normalization, and caller-supplied `collectionMetadata` completeness checks
- do not use it as a schema-aware planner; recompute involved collections and rebuild `defaults.collections` before calling it

## `nb-page-preview` preview-only mode

Use this when you only need the ASCII wireframe and are **not** preparing the real write body yet.

- CLI: `nb-page-preview --stdin-json`
- input: one page blueprint JSON document
- returns: preview-only result
- do not use it as the first real write gate when `--prepare-write` is available

## `nb-runjs validate --skill-mode`

Use this when the task is JS / RunJS specific and you need local validation.

Before you run it, lock the authoring surface in [js-surfaces/index.md](./js-surfaces/index.md), fill the loop in [runjs-authoring-loop.md](./runjs-authoring-loop.md), and choose a canonical snippet from [js-snippets/catalog.json](./js-snippets/catalog.json). The validator contract now differs between render-style JS models, action-style event/linkage code, and value-return RunJS.

- CLI: `nb-runjs validate --stdin-json --skill-mode`
- input: `{ model, code, context? }`
- returns: validation result, policy issues, and execution summary
- use it for: JS blocks, JS fields, JS actions, and event-flow `Execute JavaScript` snippets
- if it fails: repair with [runjs-repair-playbook.md](./runjs-repair-playbook.md) and retry at most 3 rounds
