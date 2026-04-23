# scene/form/toggle-required

## Use when
A linkage script toggles a peer field's required state.

## Do not use when
The target field cannot be located from live form metadata.

## Surfaces
- `linkage.execute-javascript`
- `js-model.action`

## Required ctx roots
- `ctx.model`
- `ctx.message`
- `ctx.t`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
const targetName = 'email';
const items = ctx.model?.subModels?.grid?.subModels?.items;
const fields = Array.isArray(items) ? items : Array.from(items?.values?.() || items || []);
const field = fields.find((item) => item?.props?.name === targetName || item?.uid === targetName);

field?.setProps?.({ required: true });
ctx.message.success(ctx.t('Requirement updated'));
```

## Editable slots
- Replace `email`, `required`, and the feedback text.

## Skill-mode notes
If `ctx.model` does not prove a form host, stop and inspect live reaction metadata first.
