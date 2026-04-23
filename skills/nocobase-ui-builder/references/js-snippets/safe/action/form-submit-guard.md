# action/form-submit-guard

## Use when
A form JS action should stop submission when a required value is missing.

## Do not use when
The guard can be expressed as normal form validation rules.

## Surfaces
- `js-model.action`

## Required ctx roots
- `ctx.form`
- `ctx.formValues`
- `ctx.message`
- `ctx.t`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
const values = ctx.form?.getFieldsValue?.() || ctx.formValues || {};
if (!values.title) {
  ctx.message.error(ctx.t('Title is required'));
  return;
}

await ctx.form?.submit?.();
ctx.message.success(ctx.t('Form submitted'));
```

## Editable slots
- Replace `title` with the required form field.
- Replace the messages.

## Skill-mode notes
Use only when the JS action host has form context; otherwise stop and inspect the host model first.
