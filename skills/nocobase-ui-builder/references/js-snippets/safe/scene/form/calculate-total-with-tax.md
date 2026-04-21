# scene/form/calculate-total-with-tax

## Use when
A form action/linkage script writes a tax-inclusive total into another field.

## Do not use when
The total must be returned directly to the host value contract.

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
const subtotal = Number(values.subtotal || 0);
const taxRate = Number(values.taxRate || 0);
ctx.form?.setFieldsValue?.({ total: subtotal + subtotal * taxRate });
```

## Editable slots
- Replace `subtotal`, `taxRate`, and `total`.

## Skill-mode notes
For value-return hosts, use `value-return/total-with-tax` instead.
