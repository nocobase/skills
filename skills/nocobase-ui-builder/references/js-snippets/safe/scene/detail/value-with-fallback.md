# scene/detail/value-with-fallback

## Use when
A detail/read-only JS field should render its bound value with an explicit fallback.

## Do not use when
The empty state should hide the field entirely; use a `render/null-when-empty` style snippet instead.

## Surfaces
- `js-model.render`

## Required ctx roots
- `ctx.value`
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
const rawValue = ctx.value ?? currentRecord?.description;
if (rawValue == null || String(rawValue).trim() === '') {
  ctx.render(ctx.t('No value'));
  return;
}

ctx.render(String(rawValue));
```

## Editable slots
- Replace `description` and the fallback text.

## Skill-mode notes
This keeps the detail field readable without leaving the render contract or reaching for DOM APIs.
