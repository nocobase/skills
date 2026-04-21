# scene/table/iterate-selected-rows

## Use when
An action-style script loops through selected table rows.

## Do not use when
The script should return a computed value.

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
for (const row of rows) {
  console.log(ctx.t('Selected row:'), row);
}
ctx.message.success(ctx.t('Processed {{count}} rows', { count: rows.length }));
```

## Editable slots
- Replace the loop body and message text.

## Skill-mode notes
This migrated the previous local `event-flow-iterate-selected-rows` snippet into the canonical library.
