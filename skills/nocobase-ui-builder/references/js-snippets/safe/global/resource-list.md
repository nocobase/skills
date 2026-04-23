# global/resource-list

## Use when
Action-style RunJS needs to read rows from a NocoBase collection.

## Do not use when
You only need a custom HTTP endpoint; use `global/http-request`.

## Surfaces
- `event-flow.execute-javascript`
- `js-model.action`

## Required ctx roots
- `ctx.makeResource`
- `ctx.message`
- `ctx.t`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
const resource = ctx.makeResource('MultiRecordResource');
resource.setResourceName('tasks');
resource.setPageSize(20);
resource.setFilter({ status: { $eq: 'active' } });
await resource.refresh();

const rows = Array.isArray(resource.getData?.()) ? resource.getData() : [];
ctx.message.success(ctx.t('Loaded {{count}} records', { count: rows.length }));
```

## Editable slots
- Replace `tasks`, `pageSize`, `filter`, and the feedback text.

## Skill-mode notes
This is the canonical replacement for `ctx.request({ url: 'tasks:list' })`.
