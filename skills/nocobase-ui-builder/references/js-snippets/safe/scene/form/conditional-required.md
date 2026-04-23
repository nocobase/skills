# scene/form/conditional-required

## Use when
A field becomes required only under a form condition.

## Do not use when
The condition belongs to a value-return calculation.

## Surfaces
- `linkage.execute-javascript`
- `js-model.action`

## Required ctx roots
- `ctx.model`
- `ctx.formValues`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
const required = ctx.formValues?.customerType === 'company';
const targetName = 'taxId';
const items = ctx.model?.subModels?.grid?.subModels?.items;
const fields = Array.isArray(items) ? items : Array.from(items?.values?.() || items || []);
const field = fields.find((item) => item?.props?.name === targetName || item?.uid === targetName);

field?.setProps?.({ required });
```

## Editable slots
- Replace the condition and target field.

## Skill-mode notes
This is state mutation. Do not rewrite it as `return required`.
