# scene/block/popup-record-summary

## Use when
A standalone JS block in a popup should render a compact summary from the record that opened the popup.

## Do not use when
The JS code belongs to an inner table/list row, details field, grid-card item, or record-level action inside the popup; those hosts usually use `ctx.record`.

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
const record = (await ctx.getVar('ctx.popup.record')) || {};
const name = String(record.username ?? record.nickname ?? record.name ?? ctx.t('Untitled'));
ctx.render(name);
```

## Editable slots
- Replace `username`, `nickname`, and `name` with the popup opener record fields to display.

## Skill-mode notes
Use this for `recordSemantic = popup-opener-record`. Do not replace it with `ctx.record` unless live context proves the JS model is hosted by an inner row, field, or record action.
