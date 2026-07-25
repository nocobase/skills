# JS Surfaces

Read this after [../js.md](../js.md) when the task is already known to be JS / RunJS and its owner has been classified as `complete-workspace`, `embedded/single-surface`, or `compatibility-single-file`.

## Progressive disclosure

1. Lock the owner classification and exact surface below.
2. For `complete-workspace`, follow [../runjs-workspace-source.md](../runjs-workspace-source.md) and use a safe snippet only as a scaffold for the multi-file Workspace.
3. For `embedded/single-surface` or `compatibility-single-file`, fill the scenario card in [../runjs-authoring-loop.md](../runjs-authoring-loop.md), then copy exactly one `safe` snippet recommended by [snippet-manifest.json](./snippet-manifest.json) and edit only its slots.
4. Open [../js-reference-index.md](../js-reference-index.md) only for missing `ctx.*` details.
5. Open [../js-models/index.md](../js-models/index.md) only when exact model-only behavior still matters.

## Quick route

For a new complete JS Page, read [../create-js-page-quick.md](../create-js-page-quick.md) first. A new complete JS Block follows that same Host -> Inline Workspace route after Host creation. Run the Settings Pass before implementation, keep reasonable `components`, `hooks`, `services`, and `utils` as separate local files, and send only changed paths through `run-js-sources save-changes`. The surface table describes the runtime scene; it does not impose a single-file snippet shape or justify externalization.

| Surface | Read first | Editor scene | Writeback path | Validation style |
| --- | --- | --- | --- | --- |
| Event Flow `Execute JavaScript` | [event-flow.md](./event-flow.md) | `eventFlow` | `flowRegistry.*.steps.*.defaultParams.code` | action-style |
| Linkage `Execute JavaScript` | [linkage.md](./linkage.md) | `linkage` | `actions[].name="linkageRunjs" -> params.value.script` | action-style |
| Field/default/copy value RunJS | [value-return.md](./value-return.md) | usually `formValue` | `value.source="runjs"` | value-return |
| Custom-variable RunJS | [value-return.md](./value-return.md) | `customVariable` | `variables[].runjs` | value-return |
| Complete JS Page / JS Block render | [js-model-render.md](./js-model-render.md) | `jsModel` | Workspace files through `run-js-sources`; snippets are scaffolds only | render |
| Embedded or compatibility JS model render | [js-model-render.md](./js-model-render.md) | `jsModel` | public `settings.code` / `assets.scripts` + `script`; configure uses `changes.code`; internal readback may show `stepParams.jsSettings.runJs` | render |
| JS model action | [js-model-action.md](./js-model-action.md) | `jsAction` | `clickSettings.runJs` | action-style |

## Snippet manifest

- Canonical snippet metadata lives in [../js-snippets/catalog.json](../js-snippets/catalog.json).
- [snippet-manifest.json](./snippet-manifest.json) only maps each surface to at most three first-hop `safe` snippet IDs.
- `recommendedBySceneHint` narrows those first-hop snippets for `block` / `detail` / `form` / `table` / `eventFlow` / related scene hints.
- `guarded` and `advanced` snippets must not appear in this manifest.

## Boundary

- This directory is surface-first guidance.
- The complete Workspace route may use any reasonable local source layout and must not store final source in `settings.code` or `assets.scripts`.
- The exactly-one-snippet and editable-slot rules belong only to embedded and compatibility single-file authoring.
- Full final-code examples live in [../js-snippets/index.md](../js-snippets/index.md).
- [../js-models/index.md](../js-models/index.md) remains available for legacy leaf-model details.
- [../reaction.md](../reaction.md) and [../settings.md](../settings.md) still own the final payload contract.
