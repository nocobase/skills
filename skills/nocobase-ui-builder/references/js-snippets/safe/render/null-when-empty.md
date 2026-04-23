# render/null-when-empty

## Use when
A render JS model should hide its output when the source value is empty.

## Do not use when
The host is a value-return surface; use `return null` there instead.

## Surfaces
- `js-model.render`

## Required ctx roots
- `ctx.value`
- `ctx.record`
- `ctx.render`

## Contract
- Effect style: `render`
- Top-level `return`: optional
- `ctx.render(...)`: required
- Side-effect surface: no

## Normalized snippet

```js
const value = ctx.value ?? ctx.record?.description ?? '';
if (String(value).trim() === '') {
  ctx.render(null);
  return;
}

ctx.render(String(value));
```

## Editable slots
- Replace `description` with the fallback record field.

## Skill-mode notes
Use `ctx.render(null)` for hidden render output; do not skip `ctx.render(...)` entirely.
