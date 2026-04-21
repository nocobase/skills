# Event Flow RunJS

Use this surface for event-flow steps whose action title is `Execute JavaScript`.

## Contract

- Editor scene in upstream source: `eventFlow`
- Writeback path in this skill: `flowRegistry.*.steps.*.params.code`
- Validation style: action-style
- Return is optional. Do not force `ctx.render(...)`, and do not silently treat this as `JSBlockModel`.
- Before writing back, return to [../settings.md](../settings.md) for full `flowRegistry` replacement rules.

## Minimal examples

First-hop safe snippets:

- [global/message-success](../js-snippets/safe/global/message-success.md)
- [global/http-request](../js-snippets/safe/global/http-request.md)
- [scene/table/selected-rows-count](../js-snippets/safe/scene/table/selected-rows-count.md)

Example A:

```js
ctx.message.success(ctx.t('Operation succeeded'));
```

Example B:

```js
const rows = ctx.resource?.getSelectedRows?.() || [];
for (const row of rows) {
  console.log(ctx.t('Selected row:'), row);
}
ctx.message.success(ctx.t('Processed {{count}} rows', { count: rows.length }));
```

## What to open next

- Missing `ctx.*` details -> [../js-reference-index.md](../js-reference-index.md)
- Exact action leaf rules -> [../js-models/js-action.md](../js-models/js-action.md)
- Snippet metadata -> [../js-snippets/catalog.json](../js-snippets/catalog.json)
- Repair after validator failure -> [../runjs-repair-playbook.md](../runjs-repair-playbook.md)
