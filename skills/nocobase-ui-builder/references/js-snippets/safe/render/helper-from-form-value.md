# render/helper-from-form-value

## Use when
A form JS item should render helper text only after a form value exists.

## Do not use when
The task is to update another form field; use linkage snippets.

## Surfaces
- `js-model.render`

## Required ctx roots
- `ctx.formValues`
- `ctx.form`
- `ctx.render`
- `ctx.t`

## Contract
- Effect style: `render`
- Top-level `return`: optional
- `ctx.render(...)`: required
- Side-effect surface: no

## Normalized snippet

```js
const role = ctx.formValues?.role || ctx.form?.getFieldValue?.('role');
if (!role) {
  ctx.render(null);
  return;
}

ctx.render(ctx.t('Selected role: {{role}}', { role: String(role) }));
```

## Editable slots
- Replace `role` with the form field to inspect.
- Replace the helper message.

## Skill-mode notes
This is for render-only helper text in form JS items. It should not call `ctx.setValue(...)`.
