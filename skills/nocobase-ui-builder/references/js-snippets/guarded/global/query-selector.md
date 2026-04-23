# global/query-selector

## Use when
You are already in a render-capable JS model and a DOM query is the only practical integration point.

## Do not use when
A `ctx.render(...)` or model/payload configuration can express the UI.

## Surfaces
- `js-model.render`

## Required ctx roots
- none

## Contract
- Effect style: `render`
- Top-level `return`: optional
- `ctx.render(...)`: allowed
- Side-effect surface: guarded DOM read

## Normalized snippet

```js
const element = document.querySelector('[data-testid="target"]');
if (element) {
  console.log(element.textContent || '');
}
```

## Editable slots
- Replace the selector and read-only behavior.

## Skill-mode notes
This is guarded tier. Never use it as a first-hop recommendation.
