# render/list-from-resource

## Use when
A JS block should render a short list loaded through the resource API.

## Do not use when
The host already has a table/list block that can render the collection natively.

## Surfaces
- `js-model.render`

## Required ctx roots
- `ctx.initResource`
- `ctx.resource`
- `ctx.render`
- `ctx.t`

## Contract
- Effect style: `render`
- Top-level `return`: optional
- `ctx.render(...)`: required
- Side-effect surface: resource read only

## Normalized snippet

```js
ctx.initResource?.('MultiRecordResource');
ctx.resource?.setResourceName?.('tasks');
ctx.resource?.setPageSize?.(5);
await ctx.resource?.refresh?.();

const rows = ctx.resource?.getData?.() || [];
const text = rows.length
  ? rows.map((row) => String(row.title || row.name || row.id)).join(', ')
  : ctx.t('No data');
ctx.render(text);
```

## Editable slots
- Replace `tasks` with the collection resource name.
- Replace title/name/id display field fallback.

## Skill-mode notes
Prefer native data blocks for normal lists. Use this only for compact JS block summaries.
