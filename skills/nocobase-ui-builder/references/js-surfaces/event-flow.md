# Event Flow RunJS

Use this surface for event-flow steps whose action title is `Execute JavaScript`.

## Contract

- Editor scene in the bundled product reference snapshot: `eventFlow`
- Writeback path in this skill: `flowRegistry.*.steps.*.defaultParams.code`
- Step action shape: `flowRegistry.*.steps.*.use = "runjs"` with settings under `defaultParams`
- Validation style: action-style
- Return is optional. Do not force `ctx.render(...)`, and do not silently treat this as `JSBlockModel`.
- Before writing back, return to [../settings.md](../settings.md). Localized event-flow edits should use `get-event-flow-meta` plus `add-event-flow`, `set-event-flow`, or `remove-event-flow`; full `set-event-flows` replacement is the compatibility/high-control path only.

## Minimal examples

First-hop safe snippets:

- [global/message-success](../js-snippets/safe/global/message-success.md)
- [global/resource-list](../js-snippets/safe/global/resource-list.md)
- [scene/table/selected-rows-count](../js-snippets/safe/scene/table/selected-rows-count.md)

For popup / drawer / dialog / drilldown intent, choose [global/open-popup-flow-model](../js-snippets/safe/global/open-popup-flow-model.md) from the catalog only after [../patterns/popup-openview.md](../patterns/popup-openview.md) has resolved a template-first popup-capable FlowModel with persisted `popupTemplateUid` metadata.

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
- Repair after backend `repairClass` failure -> [../runjs-repair-playbook.md](../runjs-repair-playbook.md)
