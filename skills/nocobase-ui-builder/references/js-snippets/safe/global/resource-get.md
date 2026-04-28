# global/resource-get

## Use when
Action-style RunJS needs one NocoBase record by primary key.

## Do not use when
You need a list; use `global/resource-list`.

## Surfaces
- `event-flow.execute-javascript`
- `js-model.action`

## Required ctx roots
- `ctx.makeResource`
- `ctx.getVar`
- `ctx.message`
- `ctx.t`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
const currentRecord = await ctx.getVar('ctx.record');
const resource = ctx.makeResource('SingleRecordResource');
resource.setResourceName('tasks');
resource.setFilterByTk(currentRecord?.id);
await resource.refresh();

const record = resource.getData?.() || null;
ctx.message.info(record ? String(record.title ?? record.name ?? record.id) : ctx.t('No record'));
```

## Editable slots
- Replace `tasks`, `filterByTk`, and the display field fallback.

## Skill-mode notes
This is the canonical replacement for `ctx.request({ url: 'tasks:get' })`.
