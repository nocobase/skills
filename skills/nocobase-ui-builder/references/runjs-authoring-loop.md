# RunJS Authoring Loop

Use this for every JS / RunJS write before code is produced.

## Five Steps

1. Lock the surface: choose `event-flow.execute-javascript`, `linkage.execute-javascript`, `reaction.value-runjs`, `custom-variable.runjs`, `js-model.render`, or `js-model.action`.
2. Fill the scenario card below.
3. Pick exactly one `safe` snippet from [js-surfaces/snippet-manifest.json](./js-surfaces/snippet-manifest.json) or [js-snippets/catalog.json](./js-snippets/catalog.json), using `sceneHints`, `preferredForIntents`, and `offlineSafe` to narrow first.
4. Edit only the documented slots in that snippet.
5. Run validator / preflight and repair from [runjs-repair-playbook.md](./runjs-repair-playbook.md). Retry at most 3 rounds.

## Scenario Card

- `surface`: one locked surface ID.
- `hostScene`: `eventFlow`, `linkage`, `formValue`, `customVariable`, `form`, `table`, `jsModel`, or `action`.
- `intentClass`: `notify`, `request-data`, `iterate-selected-rows`, `set-field-value`, `copy-field-values`, `toggle-state`, `calculate`, `render-helper`, `render-list`, or `submit-guard`.
- `effectStyle`: `action`, `value`, or `render`.
- `sourceScopes`: `record`, `selectedRows`, `formValues`, `form`, `resource`, `externalHttp`, or `none`.
- `targetScopes`: `message`, `notification`, `fieldValue`, `fieldState`, `clipboard`, `resource`, `render`, or `returnValue`.
- `requiredCtxRoots`: exact `ctx.*` roots needed by the chosen snippet.
- `modelUse`: one validator model from the snippet's `modelUses[surface]`.
- `forbiddenPatterns`: copied from the snippet contract and validator feedback.
- `preferredSnippetIds`: one to three catalog IDs, with one final choice.

## Effect-Style Contract

- `action`: side effects are allowed; top-level `return` is optional.
- `value`: top-level `return` is required; `ctx.render(...)` is forbidden.
- `render`: `ctx.render(...)` is required for render models.

## Stop Conditions

Stop before writing JS when any of these are unknown:

- target field
- read source
- authoring surface
- host model
- form context for a form-only API

When stopped, inspect live metadata, catalog/readback, or reaction metadata first. Do not guess.
