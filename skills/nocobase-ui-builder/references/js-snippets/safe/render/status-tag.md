# render/status-tag

## Use when
A table column, field, or block JS render model should display a compact status label.

## Do not use when
The status should be written back to a form field; use a linkage snippet instead.

## Surfaces
- `js-model.render`

## Required ctx roots
- `ctx.getVar`
- `ctx.render`

## Contract
- Effect style: `render`
- Top-level `return`: optional
- `ctx.render(...)`: required
- Side-effect surface: no

## Normalized snippet

```js
const currentRecord = await ctx.getVar('ctx.record');
const status = String(currentRecord?.status || 'unknown');
const color = status === 'active' ? 'green' : status === 'draft' ? 'blue' : 'default';
ctx.render(`<span data-color="${color}">${status}</span>`);
```

## Editable slots
- Replace `status` with the status field path.
- Replace the color mapping with the final status values.

## Skill-mode notes
Keep this as render-only code. Do not mutate form fields or call action APIs from this snippet.
