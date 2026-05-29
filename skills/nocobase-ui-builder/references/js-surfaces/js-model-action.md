# JS Model Action

Use this surface for JS actions whose main job is to run click logic.

## Contract

- Editor scene in the bundled product reference snapshot: `jsAction`
- Writeback path in this skill: `clickSettings.runJs`
- Validation style: action
- Return is optional.
- `ctx.render(...)` is not the default output mechanism.
- Exact modelUse still matters; use `JSActionModel`, `JSFormActionModel`, `JSRecordActionModel`, `JSCollectionActionModel`, or `FilterFormJSActionModel`.
- `JSItemActionModel` is not validated on this surface; it uses the render contract in [js-model-render.md](./js-model-render.md).

## Choosing `js` vs `jsItem`

- Use `js` when the action is a normal click target and the code mainly performs side effects.
- Use `jsItem` when the action itself needs custom rendering or richer item UI.
- `jsItem` action code follows the render contract and must call `ctx.render(...)`.
- `js` action code follows the click-action contract and usually should not render UI directly.

## Minimal examples

First-hop safe snippets:

- [action/message-success](../js-snippets/safe/action/message-success.md)
- [action/resource-refresh](../js-snippets/safe/action/resource-refresh.md)
- [action/form-submit-guard](../js-snippets/safe/action/form-submit-guard.md)

For popup / drawer / dialog / drilldown intent, use the popup scene hint in the snippet manifest and [global/open-popup-flow-model](../js-snippets/safe/global/open-popup-flow-model.md). The JS action should only call `ctx.openView(triggerUid, ...)` after a template-first popup-capable FlowModel exists; prefer a popup host whose persisted `targetUid = popupSettings.openView.uid` points to a template target with `popupTemplateUid` / `popupTemplateMode`.

Example:

```js
ctx.message.success(ctx.t('Action completed'));
```

## Record Context

| recordSemantic | Use this ctx path | Notes |
| --- | --- | --- |
| `popup-opener-record` | `await ctx.getVar('ctx.popup.record...')` | Popup toolbar or popup-level JS action works on the record that opened the popup. |
| `host-record` | `await ctx.getVar('ctx.record...')` | Record-level action in table/list/details works on its host record. |
| `inner-row-record` | `await ctx.getVar('ctx.record...')` | A JS action on a nested table row inside a popup works on that inner row, not the popup opener. |
| `selected-rows` | `ctx.resource?.getSelectedRows?.()` | Collection/table toolbar action works on selected rows. |

If a popup action could mean either the popup opener or a row inside the popup, inspect the target host before writing JS.

## What to open next

- Exact action leaf rules -> [../js-models/js-action.md](../js-models/js-action.md)
- Popup/openView configuration -> [../patterns/popup-openview.md](../patterns/popup-openview.md)
- Snippet metadata -> [../js-snippets/catalog.json](../js-snippets/catalog.json)
- Repair after backend `repairClass` failure -> [../runjs-repair-playbook.md](../runjs-repair-playbook.md)
