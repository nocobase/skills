# scene/table/destroy-selected-rows

## Use when
A table action should delete the currently selected rows.

## Do not use when
The task needs confirmation UI; configure a product action/popup instead.

## Surfaces
- `event-flow.execute-javascript`
- `js-model.action`

## Required ctx roots
- `ctx.resource`
- `ctx.message`
- `ctx.t`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
const rows = ctx.resource?.getSelectedRows?.() || [];
if (rows.length === 0) {
  ctx.message.warning(ctx.t('Please select records first'));
  return;
}

await ctx.resource?.destroySelectedRows?.();
ctx.message.success(ctx.t('Deleted {{count}} rows', { count: rows.length }));
```

## Editable slots
- Replace the empty-selection and success messages.

## Skill-mode notes
Use only when deletion is explicitly requested and the table resource supports selected-row deletion.
