# scene/form/copy-field-values

## Use when
A form-scoped script copies one field into another.

## Do not use when
The target is not in the same form context.

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
ctx.form?.setFieldsValue?.({
  shippingAddress: values.billingAddress || '',
});
```

## Editable slots
- Replace `billingAddress`, `shippingAddress`, and the fallback.

## Skill-mode notes
Prefer `ctx.form.getFieldsValue()` for current form state and fall back to `ctx.formValues`.
