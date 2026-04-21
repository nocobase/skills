# value-return/copy-single-field

## Use when
A value-return RunJS host should copy a single source field.

## Do not use when
The script should set another field by side effect.

## Surfaces
- `reaction.value-runjs`
- `custom-variable.runjs`

## Required ctx roots
- `ctx.formValues`

## Contract
- Effect style: `value`
- Top-level `return`: required
- `ctx.render(...)`: forbidden
- Side-effect surface: no

## Normalized snippet

```js
return ctx.formValues?.sourceField ?? '';
```

## Editable slots
- Replace `sourceField` and the fallback.

## Skill-mode notes
Do not wrap this in `ctx.render(...)`; the host consumes the returned value.
