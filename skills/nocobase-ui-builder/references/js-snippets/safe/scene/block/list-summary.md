# scene/block/list-summary

## Use when
A JS block should render a short list loaded through the resource API.

## Do not use when
The page already has a native table/list block that can show the same collection.

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
const { Card, Empty, List, Typography } = ctx.libs.antd;

ctx.initResource?.('MultiRecordResource');
ctx.resource?.setResourceName?.('tasks');
ctx.resource?.setPageSize?.(5);
await ctx.resource?.refresh?.();

const rows = ctx.resource?.getData?.() || [];
if (!rows.length) {
  ctx.render(
    <Card size="small">
      <Empty description={ctx.t('No data')} />
    </Card>,
  );
  return;
}

const dataSource = rows.map((row) => String(row.title || row.name || row.id));
ctx.render(
  <Card size="small" title={ctx.t('Summary')}>
    <List
      size="small"
      dataSource={dataSource}
      renderItem={(item) => (
        <List.Item>
          <Typography.Text>{item}</Typography.Text>
        </List.Item>
      )}
    />
  </Card>,
);
```

## Editable slots
- Replace `tasks`, the page size, and the row display field fallback.

## Skill-mode notes
Prefer native data blocks for normal lists. Use this only for compact Ant Design block-level summaries.
