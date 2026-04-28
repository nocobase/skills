# scene/block/text-summary

## Use when
A JS block should render one compact summary line from the current record.

## Do not use when
The block needs to fetch and summarize a collection; use `scene/block/list-summary`.
The block is standalone popup content reading the record that opened the popup; use `scene/block/popup-record-summary`.

## Surfaces
- `js-model.render`

## Required ctx roots
- `ctx.getVar`
- `ctx.render`
- `ctx.t`

## Contract
- Effect style: `render`
- Top-level `return`: optional
- `ctx.render(...)`: required
- Side-effect surface: no

## Normalized snippet

```js
const currentRecord = await ctx.getVar('ctx.record');
const title = String(currentRecord?.title ?? currentRecord?.name ?? ctx.t('Untitled'));
const owner = String(currentRecord?.owner?.nickname ?? currentRecord?.owner?.name ?? ctx.t('Unassigned'));
ctx.render(`${title} · ${owner}`);
```

## Editable slots
- Replace the displayed record fields and fallback text.

## Skill-mode notes
Keep this block-scoped and render-only. Use it only when the host has a real `ctx.record`; popup-level blocks should choose the popup record snippet instead.
