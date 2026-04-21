# scene/table/export-selected-json

## Use when
Selected rows should be copied as formatted JSON.

## Do not use when
The user asked for a file export; that requires a product-level export action, not this snippet.

## Surfaces
- `event-flow.execute-javascript`
- `js-model.action`

## Required ctx roots
- `ctx.resource`
- `ctx.message`
- `ctx.t`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
const rows = ctx.resource?.getSelectedRows?.() || [];
const text = JSON.stringify(rows, null, 2);
await navigator.clipboard.writeText(text);
ctx.message.success(ctx.t('Copied {{count}} rows', { count: rows.length }));
```

## Editable slots
- Replace the message text or row projection before `JSON.stringify`.

## Skill-mode notes
This is a clipboard helper, not a backend export workflow.
