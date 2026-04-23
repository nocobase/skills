# scene/block/text-summary

## Use when
A JS block should render one compact summary line from the current record.

## Do not use when
The block needs to fetch and summarize a collection; use `scene/block/list-summary`.

## Surfaces
- `js-model.render`

## Required ctx roots
- `ctx.record`
- `ctx.render`
- `ctx.t`

## Contract
- Effect style: `render`
- Top-level `return`: optional
- `ctx.render(...)`: required
- Side-effect surface: no

## Normalized snippet

```js
const title = String(ctx.record?.title ?? ctx.record?.name ?? ctx.t('Untitled'));
const owner = String(ctx.record?.owner?.nickname ?? ctx.record?.owner?.name ?? ctx.t('Unassigned'));
ctx.render(`${title} · ${owner}`);
```

## Editable slots
- Replace the displayed record fields and fallback text.

## Skill-mode notes
Keep this block-scoped and render-only. Do not mutate form fields or rely on popup/navigation APIs here.
