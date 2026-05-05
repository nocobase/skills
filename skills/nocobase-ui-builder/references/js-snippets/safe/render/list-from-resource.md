# render/list-from-resource

## Use when
A JS block should render a short list loaded through the resource API.

## Do not use when
The host already has a table/list block that can render the collection natively.

## Surfaces
- `js-model.render`

## Required ctx roots
- `ctx.libs`
- `ctx.initResource`
- `ctx.resource`
- `ctx.render`
- `ctx.t`

## Contract
- Effect style: `render`
- Top-level `return`: optional
- `ctx.render(...)`: required
- Side-effect surface: resource read only

## Normalized snippet

```js
const { Empty, List, Typography } = ctx.libs.antd;

ctx.initResource?.('MultiRecordResource');
ctx.resource?.setResourceName?.('tasks');
ctx.resource?.setPageSize?.(5);
await ctx.resource?.refresh?.();

const rows = ctx.resource?.getData?.() || [];
if (!rows.length) {
  ctx.render(<Empty description={ctx.t('No data')} />);
  return;
}

const dataSource = rows.map((row) => String(row.title || row.name || row.id));
ctx.render(
  <List
    size="small"
    dataSource={dataSource}
    renderItem={(item) => (
      <List.Item>
        <Typography.Text>{item}</Typography.Text>
      </List.Item>
    )}
  />,
);
```

## Editable slots
- Replace `tasks` with the collection resource name.
- Replace title/name/id display field fallback.

## Skill-mode notes
Prefer native data blocks for normal lists. Use this only for compact Ant Design JS block summaries.
