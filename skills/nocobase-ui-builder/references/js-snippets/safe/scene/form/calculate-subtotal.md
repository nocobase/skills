# scene/form/calculate-subtotal

## Use when
A form action/linkage script writes a calculated subtotal into another field.

## Do not use when
The current surface expects the calculated value as its return value.

## Surfaces
- `linkage.execute-javascript`
- `js-model.action`

## Required ctx roots
- `ctx.form`
- `ctx.formValues`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
const values = ctx.form?.getFieldsValue?.() || ctx.formValues || {};
const quantity = Number(values.quantity || 0);
const unitPrice = Number(values.unitPrice || 0);
ctx.form?.setFieldsValue?.({ subtotal: quantity * unitPrice });
```

## Editable slots
- Replace source fields and the target `subtotal` field.

## Skill-mode notes
For value-return hosts, use `value-return/subtotal` instead.
