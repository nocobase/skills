# Linkage RunJS

Use this surface for linkage-rule actions whose action name is `linkageRunjs`.

## Contract

- Editor scene in the bundled product reference snapshot: `linkage`
- Writeback path in this skill: `actions[].name="linkageRunjs" -> params.value.script`
- Validation style: action-style
- Return is optional unless the script is deliberately computing a temporary value for its own control flow.
- Final linkage payload rules still live in [../reaction.md](../reaction.md).

## Minimal examples

First-hop safe snippets:

- [scene/form/set-field-value](../js-snippets/safe/scene/form/set-field-value.md)
- [scene/form/copy-field-values](../js-snippets/safe/scene/form/copy-field-values.md)
- [scene/form/calculate-subtotal](../js-snippets/safe/scene/form/calculate-subtotal.md)

Example A:

```js
const recordStatus = await ctx.getVar('ctx.record.status');
const targetFieldUid = 'FIELD_UID_OR_NAME';
const items = ctx.model?.subModels?.grid?.subModels?.items;
const candidates = Array.isArray(items) ? items : Array.from(items?.values?.() || items || []);
const fieldModel =
  candidates.find((item) => item?.uid === targetFieldUid) ||
  candidates.find((item) => item?.props?.name === targetFieldUid);

if (!fieldModel) {
  ctx.message?.warning?.(ctx.t('Field {{name}} not found', { name: targetFieldUid }));
  return;
}

fieldModel.setProps({ value: recordStatus ?? ctx.t('Updated value') });
ctx.message?.success?.(ctx.t('Updated field {{name}}', { name: targetFieldUid }));
```

Example B:

```js
const record = (await ctx.getVar('ctx.record')) || {};
if (!record.sameAsAbove) {
  return;
}

const items = ctx.model?.subModels?.grid?.subModels?.items;
const candidates = Array.isArray(items) ? items : Array.from(items?.values?.() || items || []);
const targetField = candidates.find((item) => item?.props?.name === 'shippingAddress');

if (targetField) {
  targetField.setProps({ value: record.billingAddress });
}
```

## What to open next

- `ctx.*` lookup -> [../js-reference-index.md](../js-reference-index.md)
- Final reaction write shape -> [../reaction.md](../reaction.md)
- Snippet metadata -> [../js-snippets/catalog.json](../js-snippets/catalog.json)
- Repair after validator failure -> [../runjs-repair-playbook.md](../runjs-repair-playbook.md)
