# JS

Read this file when the current write involves JS `code`, `renderer: "js"`, `jsBlock`, `jsColumn`, `jsItem`, a `js` action, or chart `visual.raw / events.raw`. First classify the owner as `complete-workspace`, `embedded/single-surface`, or `compatibility-single-file`; only the latter two use [runjs-authoring-loop.md](./runjs-authoring-loop.md). Then route by authoring surface in [js-surfaces/index.md](./js-surfaces/index.md). For bundled capability docs, `ctx.*` API references, and scenario-level examples copied into this skill, see [js-reference-index.md](./js-reference-index.md). For capability-placement constraints, see [capabilities.md](./capabilities.md). For family / locator / target, see [runtime-playbook.md](./runtime-playbook.md). For chart topic routing, see [chart.md](./chart.md).

## Contents

1. Public JS capabilities
2. Owner classification
3. Surface-first routing
4. Authoring loop
5. Reference layers
6. Write repair
7. Skill mapping
8. Container support matrix
9. Code style and context
10. Strict Render rules
11. Execution reminders

## Owner classification

Before the first complete RunJS authoring operation, run `nb api run-js-sources capabilities -j` and record its
`authoringContractVersion`, `inlineWorkspace.ownerKinds`, `inlineWorkspace.modelUses`, `inlineWorkspace.saveMode`, and
`externalization.available`. Then classify before selecting a snippet or writing implementation code:

Apply the ordered solution boundary and stop at the first match: a JS feature needing a new backend API, database table,
data migration, ACL/permission enforcement, or server capability uses a full **NocoBase Plugin**; explicit JS Template
creation/use/Save as intent, explicit reusable/distributable JS Template intent, or multiple compatible Hosts sharing one
maintained JS implementation without copied code uses **JS Template**; reusable UI/Flow structure without a shared JS
implementation uses **UI Template**; one Host exclusively owning its implementation uses **Inline RunJS**. Existing-app
ACL administration and data-model configuration remain specialist handoffs. Multiple files, complex code, hooks,
dashboards, Git storage/ownership, or vague future distribution do not override single-Host Inline ownership.
UI Template reuses UI/Flow structure; JS Template shares one JS implementation.

- `complete-workspace`: the requested complete JS Model has a matching `ownerKind` and `modelUse` in the machine contract, and Host create/get returns a canonical locator. This includes complete JS Page, Block, Field, Editable Field, Column, Item, Item Action, and action-family Models, not only owners already materialized as Workspaces.
- `embedded/single-surface`: event-flow Execute JavaScript, linkage, value-return/default/copy, custom variable, workflow JavaScript, chart option/events, `flowRegistry` RunJS, and other code whose owner is not declared by the complete Workspace contract. Use the scoped five-step RunJS loop.
- `compatibility-single-file`: the compatibility gate explicitly selected the public single-file path for an owner that cannot use the Workspace source route. Use the scoped five-step RunJS loop; do not infer this route merely because the requested code is short.

If the owner type is unclear, inspect the live owner and capability gate before generating code. Copy the canonical locator returned by Host create/get exactly; never construct it from `uid`, `modelUid`, `use`, or `fieldUid`. Do not downgrade a complete Workspace to single-file authoring after a compile or save failure. If the user explicitly requests multiple files, missing contract support, locator, or readiness is a stop condition rather than a compatibility fallback.

## Surface-first routing

For a **new complete JS Page** use the `Create JS page` route in [create-js-page-quick.md](./create-js-page-quick.md). Every other capability-backed complete JS Model enters the same Host -> canonical locator -> Inline Workspace route after Host creation. These `complete-workspace` surfaces are not JS Templates merely because the code has multiple files, imports, hooks, or services.

Choose the authoring surface before you chase `ctx.*` details:

- event-flow `Execute JavaScript` -> [js-surfaces/event-flow.md](./js-surfaces/event-flow.md)
- linkage `Execute JavaScript` -> [js-surfaces/linkage.md](./js-surfaces/linkage.md)
- field/default/copy/custom-variable value-return RunJS -> [js-surfaces/value-return.md](./js-surfaces/value-return.md)
- render-style JS model code -> [js-surfaces/js-model-render.md](./js-surfaces/js-model-render.md); for a capability-backed complete Model, continue into [runjs-workspace-source.md](./runjs-workspace-source.md)
- action-style JS model code -> [js-surfaces/js-model-action.md](./js-surfaces/js-model-action.md); for a capability-backed complete Model, continue into [runjs-workspace-source.md](./runjs-workspace-source.md)
- exact `JSBlockModel` / `JSFieldModel` / `JSItemModel` leaf behavior -> [js-models/index.md](./js-models/index.md) only after the surface is already clear

## Authoring loop

For `complete-workspace`, create or locate the Host, copy its returned canonical locator exactly, set `sourceMode: "inline"`, call `runJSSources:open`, complete the Settings Pass from `src/client/entry.json` **before implementation code**, edit the needed Workspace source files, then call `runJSSources:saveChanges` with only changed paths plus `baseCommitId`, `baseOwnerFingerprint`, and per-path `expectedBlobHash`. The save compiles the complete materialized candidate; repair diagnostics and retry against the unchanged base. `compilePreview` remains optional for a dry-run or debugging. Settings are Host values and do not create source commits. The Workspace may contain any reasonable local `components`, `hooks`, `services`, `utils`, and related source files. A safe snippet is only a scaffold; it does not impose one-snippet, editable-slot, or single-file limits. Keep final source in Workspace files, never in `settings.code` or `assets.scripts`.

For `embedded/single-surface` and `compatibility-single-file`, use the scoped five-step loop:

1. Lock the surface.
2. Fill the scenario card in [runjs-authoring-loop.md](./runjs-authoring-loop.md), including `recordSemantic` and `contextEvidence` before choosing any record path.
3. Select one `safe` snippet from [js-snippets/catalog.json](./js-snippets/catalog.json).
4. Edit only the snippet's editable slots.
5. Send the raw `nb api flow-surfaces` payload. If the response returns `errors[]`, repair the listed issues with [runjs-repair-playbook.md](./runjs-repair-playbook.md), using `details.repairClass` when present, and retry.

If target field, read source, surface, host model, or required form context is unknown, stop and inspect metadata before writing code.

For popup / drawer / dialog / drilldown intent, do not start from code. First create or resolve a template-first popup-capable FlowModel through [patterns/popup-openview.md](./patterns/popup-openview.md). In the final code, `ctx.openView(triggerUid, ...)` is allowed only when `triggerUid` is an existing popup-capable FlowModel; prefer a popup host whose `targetUid = popupSettings.openView.uid` points to a template target and preserves `popupTemplateUid` / `popupTemplateMode`. Do not use a `ChildPageModel`, page, tab, popup subtree, or transient uid as the trigger target.

For JS model render surfaces, default to Ant Design UI from `ctx.libs.antd` / `ctx.libs.antdIcons`. Do not make bare HTML strings, one-off inline-styled DOM, or custom widget markup the first choice when an Ant Design component fits. Use `ctx.importAsync()` / `ctx.requireAsync()` only when the requested capability is outside Ant Design's built-in component set, such as specialized charts, maps, calendars, Gantt views, or drag-and-drop engines.

## Public JS Capabilities

- `jsBlock`
- `js` action
- bound-field `renderer: "js"`
- standalone JS fields: `jsColumn` / `jsItem`
- chart custom option: `visual.raw`
- chart events: `events.raw`

## Reference Layers

- Surface-first reference docs live under [js-surfaces/index.md](./js-surfaces/index.md). Use that layer first when the main uncertainty is "which RunJS scene am I writing for?".
- Canonical final-code examples live under [js-snippets/index.md](./js-snippets/index.md). Use this before opening the broader reference snapshot.
- Bundled product reference snapshot docs and product/runtime examples live under [js-reference-index.md](./js-reference-index.md) and [`../runtime/reference-assets/upstream-js/`](../runtime/reference-assets/upstream-js/interface-builder/runjs.md). Use that layer when you need `ctx.*` API details, scenario examples, or broader JS authoring guidance.
- Skill-side JS authoring guidance stays here. Use this layer for model selection, strict render rules, write shape, and `errors[]` repair routing.
- Legacy model-specific leaf docs still live under [js-models/index.md](./js-models/index.md). Treat them as a second-hop lookup, not the first entrypoint.
- For field values, linkage, block/action state, or whole-page/localized reaction writes, return to [reaction.md](./reaction.md). Bundled linkage/event-flow reference pages describe product behavior, but they do not replace the skill payload contract.

## Write Repair

Route repair by the owner classification:

- For `embedded/single-surface` or `compatibility-single-file`, send the direct `nb api flow-surfaces <action>` payload and repair all returned `errors[]` in one pass. Map `details.repairClass` to [runjs-repair-playbook.md](./runjs-repair-playbook.md).
- For `complete-workspace`, repair changed Workspace source files from `save-changes` artifact diagnostics and retry through `run-js-sources`; do not fall back to `settings.code` or `assets.scripts`.
- If the required surface is `jsBlock`, keep it as `jsBlock`. Do not switch it to `table`, `list`, `chart`, `actionPanel`, `gridCard`, `markdown`, or a deferred note just because the first payload failed.
- Error metadata is intentionally minimal: expect `ruleId`, `path`, `message`, and `details.repairClass` / `details.suggestedAction` when applicable. Do not depend on `docsKey`, `retryable`, `surfaceStyle`, or `suggestedSnippetIds`.

## Skill Mapping

| UI capability | Typical location | modelUse | style | Notes |
| --- | --- | --- | --- | --- |
| `jsBlock` | page / tab / popup block area | `JSBlockModel` | render | block-level render contract |
| `jsColumn` | `table` | `JSColumnModel` | render | standalone table column |
| `jsItem` | `form/createForm/editForm` | `JSItemModel` | render | standalone form item |
| `renderer: "js"` | `table/details/list/gridCard` | `JSFieldModel` | render | display-state JS renderer bound to a real field |
| `renderer: "js"` | `form/createForm/editForm` | `JSEditableFieldModel` | render | editable JS renderer bound to a real field |
| block-level `js` action | block actions on `table/list/gridCard/calendar/kanban`, etc. | `JSCollectionActionModel` | action | targets the whole dataset |
| record-level `js` action | `table/details/list/gridCard` | `JSRecordActionModel` | action | targets the current record |
| form `js` action | `form/createForm/editForm` | `JSFormActionModel` | action | targets form context |
| filter-form `js` action | `filterForm` | `FilterFormJSActionModel` | action | targets filter-form context |
| action-panel / generic `js` action | `actionPanel` or a generic action container | `JSActionModel` | action | fallback when there is no more specific action context |
| custom-rendered action item | published action item containers on `table/list/gridCard/calendar/kanban` block actions, `table/details/list/gridCard` record actions, and `createForm/editForm` actions | `JSItemActionModel` | render | custom-rendered action item; context depends on the host, so verify live context before using record/form helpers |
| chart `visual.raw` | chart-block custom option | `ChartOptionModel` | value | directly `return` an ECharts option object |
| chart `events.raw` | chart-block event script | `ChartEventsModel` | action | registers chart events; route popup/openView behavior through configuration when possible |

If the live environment does not make it clear which JS action model applies, stop first. Read `catalog` / `get` to narrow container and context, then choose the model. Do not guess.

## Container Support Matrix

| Capability | Allowed locations | Key constraint |
| --- | --- | --- |
| `js` action | `block` / `record` / `form` / `filterForm` / `actionPanel` | choose the correct action scope first |
| `jsItem` action | block actions on `table/list/gridCard/calendar/kanban`, record actions on `table/details/list/gridCard`, form actions on `createForm/editForm` | custom action item rendering; do not use on `filterForm` or `actionPanel` |
| `renderer: "js"` | `table/details/list/gridCard/form/createForm/editForm` | still binds to a real field |
| `jsColumn` | `table` | standalone field, not bound to a real `fieldPath` |
| `jsItem` | `form/createForm/editForm` | standalone field, not bound to a real `fieldPath` |

## Action Type Choice

- Prefer built-in action types first: `filter`, `addNew`, `view`, `edit`, `delete`, `updateRecord`, `bulkUpdate`, `triggerWorkflow`, and similar live catalog actions.
- Choose `type: "js"` when the user wants a normal click action: run logic, call an API, refresh data, show a message, or do lightweight computation after one click.
- Choose `type: "jsItem"` when the user wants a custom-rendered action item: dropdown/menu content, button groups, split buttons, status chips, helper UI, multiple controls, or any action surface that is not just one ordinary click button.
- Do not silently downgrade `jsItem` to `js` when the live `catalog` does not expose `jsItem` on that target. Stop and report the backend capability gap instead.

## Code Style and Context

- Output readable multiline JS by default, using 2-space indentation consistently. In JSON payloads, preserve those line breaks inside `code` strings with `\n`; do not flatten multi-statement RunJS into one line for transport convenience.
- Keep only a single short return or expression on one line. Any code with local variables, conditional branches, fallback handling, string assembly, `await`, `ctx.render(...)`, or more than one statement must be multiline before JS validation and before the nb write.
- For complex template strings, conditional branches, or string assembly, split them into local variables first and then pass them into `ctx.render(...)`.
- For render-style JS model code, prefer React JSX composed from `ctx.libs.antd` and `ctx.libs.antdIcons`. Use `Typography`, `Tag`, `Space`, `List`, `Card`, `Alert`, `Empty`, `Statistic`, `Table`, or similar built-in components before writing raw HTML strings or custom CSS.
- If an external component library is necessary, keep surrounding states such as loading, error, empty, actions, and labels in Ant Design where practical, and document why built-in Ant Design components are not enough.
- Start with the runtime profile's `defaultContextShape`. If live nb readback already knows a more precise `resource` / `collection` / `collectionField` / `record` / `formValues` / `namePath`, override the defaults with live data.
- Do not translate the phrase "current record" directly into a direct `ctx.record` read. Pick a `recordSemantic` first: popup opener data uses `await ctx.getVar('ctx.popup.record...')`, row/field host record values use `await ctx.getVar('ctx.record...')`, parent popup data uses `await ctx.getVar('ctx.popup.parent.record...')`, and selected table rows use `ctx.resource.getSelectedRows?.()`.
- Record the `contextEvidence` used for that choice. For localized edits, prefer `flow-surfaces context --target ... --path popup.record` and `--path record`; for whole-page drafts, use the planned host position and stop if the record semantic is ambiguous.
- If a JSBlock example needs to fetch data proactively, prefer `ctx.initResource(...)` plus `ctx.resource`.

## Strict Render Rules

The following models are strict render models: `JSBlockModel`, `JSFieldModel`, `JSEditableFieldModel`, `JSItemModel`, `JSColumnModel`, and `JSItemActionModel`.

All of them obey the same rules:

- You must access context through `ctx.*`
- Bare `record` / `formValues` / `resource` / `collection` / `collectionField` / `value` / `namePath` all count as failures
- You must call `ctx.render(...)` explicitly
- You cannot rely on `return` for implicit rendering
- If `errors[]` report `missing-top-level-return`, `replace-innerhtml-with-render`, `render-unreachable-render-call`, or similar repair classes, fix the code directly. Do not work around them

`ChartOptionModel` and `ChartEventsModel` are not strict render models:

- They do not require `ctx.render(...)`
- `ChartOptionModel` should directly `return option`
- `ChartEventsModel` mainly runs bare `chart.on(...)` / `chart.off(...)`; do not write `ctx.chart.on(...)`

## Execution Reminders

- Prefer `configure` for JS-related configuration.
- `JS Action` is click logic: it writes to `clickSettings.runJs` and does not require `ctx.render(...)`.
- `JS Item Action` is custom action-item rendering: it writes to `jsSettings.runJs` and must call `ctx.render(...)`.
- `renderer: "js"` is not a standalone field type. `jsColumn` / `jsItem` are the standalone field types.
- Standalone JS fields like `jsColumn` / `jsItem` may omit a real `fieldPath` at creation time. Only real-field `renderer: "js"` requires `fieldPath`.
- For form-scoped helper text that should appear only after a form value is selected, prefer a `jsItem` that calls `ctx.render(null)` while hidden and `ctx.render(...)` when visible. Current live `fieldLinkage` does not expose JSItem pseudo paths as target fields.
- When that render-null pattern is the intended helper toggle, treat it as successful helper-toggle proof in readback/evidence summaries; do not mark the helper outcome false only because there was no separate reaction write against the JSItem uid.
- `filterForm` does not support `renderer: "js"`, `jsColumn`, or `jsItem`. If JS is required there, redesign as a block or action instead.
- Embedded and compatibility single-file writes go through `nb api flow-surfaces <action>`; if the response returns `errors[]`, fix the payload and retry. Complete Workspace source writes use `run-js-sources`.
