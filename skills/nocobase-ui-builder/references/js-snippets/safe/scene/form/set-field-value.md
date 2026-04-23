# scene/form/set-field-value

## Use when
A form-scoped action or linkage script sets one known field.

## Do not use when
The field value must be returned to a value surface; use `value-return/copy-single-field`.

## Surfaces
- `linkage.execute-javascript`
- `js-model.action`

## Required ctx roots
- `ctx.form`
- `ctx.message`
- `ctx.t`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
ctx.form?.setFieldsValue?.({ status: 'draft' });
ctx.message.success(ctx.t('Status updated'));
```

## Editable slots
- Replace `status`, `draft`, and the feedback text.

## Skill-mode notes
Only use this when live metadata proves the host has form context.
