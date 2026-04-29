# JS Model Action

Use this surface for JS actions whose main job is to run click logic.

## Contract

- Editor scene in the bundled product reference snapshot: `jsAction`
- Writeback path in this skill: `clickSettings.runJs`
- Validation style: action
- Return is optional.
- `ctx.render(...)` is not the default output mechanism.
- Exact modelUse still matters; use `JSActionModel`, `JSFormActionModel`, `JSRecordActionModel`, `JSCollectionActionModel`, `JSItemActionModel`, or `FilterFormJSActionModel`.

## Minimal examples

First-hop safe snippets:

- [action/message-success](../js-snippets/safe/action/message-success.md)
- [action/resource-refresh](../js-snippets/safe/action/resource-refresh.md)
- [action/form-submit-guard](../js-snippets/safe/action/form-submit-guard.md)

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
- Repair after validator failure -> [../runjs-repair-playbook.md](../runjs-repair-playbook.md)
