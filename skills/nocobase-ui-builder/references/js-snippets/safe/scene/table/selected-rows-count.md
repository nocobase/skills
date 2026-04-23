# scene/table/selected-rows-count

## Use when
An action-style script needs to report how many table rows are selected.

## Do not use when
The host is not a table/action context with `ctx.resource`.

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
ctx.message.info(ctx.t('Selected {{count}} rows', { count: rows.length }));
```

## Editable slots
- Replace the message text.

## Skill-mode notes
If no table selection exists, stop and choose a non-table snippet.
