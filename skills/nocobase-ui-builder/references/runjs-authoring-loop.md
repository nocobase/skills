# RunJS Authoring Loop

Use this loop only for `embedded/single-surface` RunJS and the explicitly selected `compatibility-single-file` path. New complete JS Pages, new complete JS Blocks, and owners already materialized as Workspaces use the Workspace loop below instead.

## Contents

1. Classification gate
2. Embedded / single-surface five steps
3. Complete Workspace loop
4. Scenario, context, effect, and popup safety
5. Repair, UI library, and stop contracts

## Classification Gate

- `complete-workspace`: new complete JS Page, new complete JS Block, or an existing Workspace owner.
- `embedded/single-surface`: event-flow Execute JavaScript, linkage, value-return, custom variable, JS action/field/item/column, or another RunJS fragment embedded in one owner.
- `compatibility-single-file`: the capability gate explicitly selected the public single-file code shape.

Lock this classification before generating code. A compile, preview, or save error does not authorize switching a complete Workspace to the compatibility path.

## Embedded / Single-Surface Five Steps

1. Lock the surface: choose `event-flow.execute-javascript`, `linkage.execute-javascript`, `reaction.value-runjs`, `custom-variable.runjs`, `js-model.render`, or `js-model.action`.
2. Fill the scenario card below.
3. Pick exactly one `safe` snippet from [js-surfaces/snippet-manifest.json](./js-surfaces/snippet-manifest.json) or [js-snippets/catalog.json](./js-snippets/catalog.json), using `sceneHints`, `preferredForIntents`, and `offlineSafe` to narrow first.
4. Edit only the documented slots in that snippet.
5. Write through `nb api flow-surfaces <action>`. If the response returns `errors[]`, repair the listed issues from [runjs-repair-playbook.md](./runjs-repair-playbook.md), keyed by `details.repairClass`, and retry.

These five restrictions also apply to `compatibility-single-file`. They do not constrain a complete Workspace.

## Complete Workspace Loop

For `complete-workspace`, follow [runjs-workspace-source.md](./runjs-workspace-source.md):

1. Create or locate the Host, set `sourceMode: "inline"`, and open its canonical locator through `run-js-sources`.
2. Complete the Settings Pass from `src/client/entry.json` before implementation code and consume declared settings through `ctx.settings`.
3. Use a safe snippet only as a scaffold. Split implementation into any reasonable local files, including `components`, `hooks`, `services`, and `utils`; there is no one-snippet or editable-slot limit.
4. Submit only changed paths through `save-changes`; omitted paths remain unchanged and delete is explicit.
5. Repair compile or conflict diagnostics and retry. Use `compile-preview` only for an explicit dry-run or debugging step.

Keep final Workspace source in source files. Do not put it back into `settings.code` or `assets.scripts`; those are compatibility/single-surface or Host-bootstrap shapes, not the final source channel for a complete Workspace.

## Scenario Card

- `surface`: one locked surface ID.
- `hostScene`: `eventFlow`, `linkage`, `formValue`, `customVariable`, `form`, `table`, `jsModel`, or `action`.
- `intentClass`: `notify`, `request-data`, `iterate-selected-rows`, `set-field-value`, `copy-field-values`, `toggle-state`, `calculate`, `render-helper`, `render-list`, or `submit-guard`.
- `effectStyle`: `action`, `value`, or `render`.
- `sourceScopes`: `record`, `selectedRows`, `formValues`, `form`, `resource`, `externalHttp`, or `none`.
- `targetScopes`: `message`, `notification`, `fieldValue`, `fieldState`, `clipboard`, `resource`, `render`, or `returnValue`.
- `recordSemantic`: one of `none`, `host-record`, `popup-opener-record`, `parent-popup-record`, `inner-row-record`, or `selected-rows`.
- `contextEvidence`: the live context readback, catalog target, or planned host position proving the selected ctx root.
- `requiredCtxRoots`: exact `ctx.*` roots needed by the chosen snippet.
- `modelUse`: one model from the snippet's `modelUses[surface]`.
- `uiLibraryPolicy`: `antd-built-in` by default for render-style JS model UI; use `external-library` only when Ant Design lacks the requested capability.
- `forbiddenPatterns`: copied from the snippet contract and returned errors.
- `preferredSnippetIds`: one to three catalog IDs, with one final choice.

## Record Semantic Map

Choose this before writing code whenever the request says "current record", "当前记录", "当前弹窗记录", or similar:

| recordSemantic | Use this ctx path | Typical case |
| --- | --- | --- |
| `popup-opener-record` | `await ctx.getVar('ctx.popup.record...')` | A standalone JS block/action in a popup needs the record that opened the popup. |
| `host-record` | `await ctx.getVar('ctx.record...')` | JS field/column/action is hosted by a details, table row, list item, or grid-card item. |
| `inner-row-record` | `await ctx.getVar('ctx.record...')` | A popup contains a nested table/list and the JS action belongs to that inner row. |
| `parent-popup-record` | `await ctx.getVar('ctx.popup.parent.record...')` | A nested popup needs the outer popup's opener record. |
| `selected-rows` | `ctx.resource?.getSelectedRows?.()` | A table toolbar/bulk action works on selected rows. |

If both `popup.record` and `record` are available, do not guess from the word "current". Use the UI host: popup-level content uses `popup-opener-record`; row/field content inside the popup uses `inner-row-record` or `host-record`.

## Effect-Style Contract

- `action`: side effects are allowed; top-level `return` is optional.
- `value`: top-level `return` is required; `ctx.render(...)` is forbidden.
- `render`: `ctx.render(...)` is required for render models.

These effect-style rules apply to both the embedded loop and complete Workspace code. Strict render models must still use `ctx.*` roots and call `ctx.render(...)`; never replace that contract with bare `record`, `formValues`, `resource`, or an implicit return.

## Popup Safety

Popup, drawer, dialog, and drilldown intent remains template-first on both paths. Resolve a persisted popup-capable FlowModel before code. `ctx.openView(triggerUid, ...)` is allowed only when `triggerUid` is that existing popup-capable model; never target a `ChildPageModel`, page, tab, popup subtree, or transient uid.

## Repair Contract

- JS / RunJS write failures are reported as `errors[]` with stable `path`, `ruleId`, `message`, and minimal `details`.
- Use `details.repairClass` to choose the repair playbook row.
- Do not expect skill-only metadata such as `docsKey`, `retryable`, `surfaceStyle`, or `suggestedSnippetIds`.

## UI Library Policy

- `antd-built-in`: default for `js-model.render`; render React JSX with `ctx.libs.antd` / `ctx.libs.antdIcons`.
- `external-library`: allowed only for capabilities such as specialized charts, maps, calendars, Gantt views, drag-and-drop engines, or other UI that Ant Design does not provide.
- When `external-library` is selected, keep loading, error, empty, labels, and surrounding actions in Ant Design where practical.

## Stop Conditions

Stop before writing JS when any of these are unknown:

- target field
- read source
- authoring surface
- host model
- form context for a form-only API
- record semantic when more than one record-like source is plausible

When stopped, inspect live metadata, catalog/readback, or reaction metadata first. Do not guess.
