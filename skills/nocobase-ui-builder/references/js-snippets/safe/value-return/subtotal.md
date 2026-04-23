# value-return/subtotal

## Use when
A value-return RunJS host must compute a subtotal.

## Do not use when
The script should mutate a form field; use `scene/form/calculate-subtotal`.

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
const quantity = Number(ctx.formValues?.quantity || 0);
const unitPrice = Number(ctx.formValues?.unitPrice || 0);
return quantity * unitPrice;
```

## Editable slots
- Replace `quantity` and `unitPrice`.

## Skill-mode notes
This migrated the previous local `value-return-subtotal` snippet into the canonical library.
