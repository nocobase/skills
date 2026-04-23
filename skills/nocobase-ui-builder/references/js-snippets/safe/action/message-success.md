# action/message-success

## Use when
A JS action should show a success message after completing its logic.

## Do not use when
The code belongs to a render model; render models must call `ctx.render(...)`.

## Surfaces
- `js-model.action`

## Required ctx roots
- `ctx.message`
- `ctx.t`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
ctx.message.success(ctx.t('Action completed'));
```

## Editable slots
- Replace `Action completed` with the final action message.

## Skill-mode notes
Use this for JS action models, not for value-return or render surfaces.
