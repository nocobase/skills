# scene/form/fill-from-record

## Use when
A form action/linkage script copies values from the current record into editable fields.

## Do not use when
No current record context is available.

## Surfaces
- `linkage.execute-javascript`
- `js-model.action`

## Required ctx roots
- `ctx.form`
- `ctx.record`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
const record = ctx.record || {};
ctx.form?.setFieldsValue?.({
  title: record.title || '',
  ownerId: record.owner_id ?? record.owner?.id,
});
```

## Editable slots
- Replace target field names and record source fields.

## Skill-mode notes
If the request is just a default value, prefer value/source configuration before JS.
