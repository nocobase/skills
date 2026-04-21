# JS Surfaces

Read this after [../js.md](../js.md) when the task is already known to be JS / RunJS. Choose the authoring surface first, then open one `safe` snippet from [../js-snippets/catalog.json](../js-snippets/catalog.json).

## Progressive disclosure

1. Pick the exact surface below.
2. Fill the scenario card in [../runjs-authoring-loop.md](../runjs-authoring-loop.md).
3. Copy one `safe` snippet recommended by [snippet-manifest.json](./snippet-manifest.json).
4. Open [../js-reference-index.md](../js-reference-index.md) only for missing `ctx.*` details.
5. Open [../js-models/index.md](../js-models/index.md) only when exact model-only behavior still matters.

## Quick route

| Surface | Read first | Editor scene | Writeback path | Validation style |
| --- | --- | --- | --- | --- |
| Event Flow `Execute JavaScript` | [event-flow.md](./event-flow.md) | `eventFlow` | `flowRegistry.*.steps.*.params.code` | action-style |
| Linkage `Execute JavaScript` | [linkage.md](./linkage.md) | `linkage` | `actions[].name="linkageRunjs" -> params.value.script` | action-style |
| Field/default/copy value RunJS | [value-return.md](./value-return.md) | usually `formValue` | `value.source="runjs"` | value-return |
| Custom-variable RunJS | [value-return.md](./value-return.md) | `customVariable` | `variables[].runjs` | value-return |
| JS model render | [js-model-render.md](./js-model-render.md) | `jsModel` | `stepParams.jsSettings.runJs` | render |
| JS model action | [js-model-action.md](./js-model-action.md) | `jsAction` | `clickSettings.runJs` | action-style |

## Snippet manifest

- Canonical snippet metadata lives in [../js-snippets/catalog.json](../js-snippets/catalog.json).
- [snippet-manifest.json](./snippet-manifest.json) only maps each surface to at most three first-hop `safe` snippet IDs.
- `recommendedBySceneHint` narrows those first-hop snippets for `block` / `detail` / `form` / `table` / `eventFlow` / related scene hints.
- `guarded` and `advanced` snippets must not appear in this manifest.

## Boundary

- This directory is surface-first guidance.
- Full final-code examples live in [../js-snippets/index.md](../js-snippets/index.md).
- [../js-models/index.md](../js-models/index.md) remains available for legacy leaf-model details.
- [../reaction.md](../reaction.md) and [../settings.md](../settings.md) still own the final payload contract.
