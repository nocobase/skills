# scene/table/concat-fields

## Use when
Selected row fields should be joined into copyable plain text.

## Do not use when
The expected output is a returned value for one field.

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
const text = rows
  .map((row) => [row.code, row.name].filter(Boolean).join(' - '))
  .join('\n');
await navigator.clipboard.writeText(text);
ctx.message.success(ctx.t('Copied {{count}} rows', { count: rows.length }));
```

## Editable slots
- Replace `code`, `name`, the separator, and message text.

## Skill-mode notes
Keep this table-scoped. For one current record, use `global/clipboard-copy-text`.
