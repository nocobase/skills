# scene/form/toggle-disabled

## Use when
A linkage script disables or enables a peer field.

## Do not use when
The host does not expose form values or form child models.

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
const targetName = 'approvalComment';
const disabled = Boolean(ctx.formValues?.locked);
const items = ctx.model?.subModels?.grid?.subModels?.items;
const fields = Array.isArray(items) ? items : Array.from(items?.values?.() || items || []);
const field = fields.find((item) => item?.props?.name === targetName || item?.uid === targetName);

field?.setProps?.({ disabled });
```

## Editable slots
- Replace `approvalComment` and the `disabled` condition.

## Skill-mode notes
Do not guess target pseudo paths; locate the actual field from live metadata.
