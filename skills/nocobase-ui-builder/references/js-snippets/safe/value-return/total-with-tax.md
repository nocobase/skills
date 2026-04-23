# value-return/total-with-tax

## Use when
A value-return RunJS host must compute tax-inclusive total.

## Do not use when
The total should be written into another field by side effect.

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
const subtotal = Number(ctx.formValues?.subtotal || 0);
const taxRate = Number(ctx.formValues?.taxRate || 0);
return subtotal + subtotal * taxRate;
```

## Editable slots
- Replace `subtotal`, `taxRate`, and the formula.

## Skill-mode notes
This migrated the previous local `value-return-total-with-tax` snippet into the canonical library.
