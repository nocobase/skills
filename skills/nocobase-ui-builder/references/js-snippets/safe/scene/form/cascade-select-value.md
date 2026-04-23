# scene/form/cascade-select-value

## Use when
A parent select field should clear dependent child fields.

## Do not use when
The dependency should be represented as declarative field linkage without JS.

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
if (values.country !== 'CN') {
  ctx.form?.setFieldsValue?.({ province: undefined, city: undefined });
}
```

## Editable slots
- Replace `country`, `CN`, `province`, and `city`.

## Skill-mode notes
Only use this after live metadata confirms all target fields exist in the same form.
