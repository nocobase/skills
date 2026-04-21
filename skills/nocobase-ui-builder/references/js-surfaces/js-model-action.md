# JS Model Action

Use this surface for JS actions whose main job is to run click logic.

## Contract

- Editor scene in upstream source: `jsAction`
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

## What to open next

- Exact action leaf rules -> [../js-models/js-action.md](../js-models/js-action.md)
- Popup/openView configuration -> [../patterns/popup-openview.md](../patterns/popup-openview.md)
- Snippet metadata -> [../js-snippets/catalog.json](../js-snippets/catalog.json)
- Repair after validator failure -> [../runjs-repair-playbook.md](../runjs-repair-playbook.md)
