# scene/block/metric-cards

## Use when
A JS block should render one or more numeric metrics from NocoBase collections, such as KPI cards, tracked product count, pending item count, weekly new record count, or dashboard summary numbers.

## Do not use when
The user wants to browse records as cards. Use `GridCardBlockModel` for record cards and `ChartBlockModel` for trends, distributions, rankings, or visual analysis.

## Surfaces
- `js-model.render`

## Required ctx roots
- `ctx.libs`
- `ctx.makeResource`
- `ctx.render`
- `ctx.t`

## Contract
- Effect style: `render`
- Top-level `return`: optional
- `ctx.render(...)`: required
- Side-effect surface: resource read only

## Normalized snippet

```js
const { Alert, Card, Col, Row, Statistic } = ctx.libs.antd;

async function countRecords(collectionName, filter) {
  const resource = ctx.makeResource
    ? ctx.makeResource('MultiRecordResource')
    : null;
  if (!resource) {
    throw new Error('MultiRecordResource is not available');
  }
  resource.setResourceName(collectionName);
  resource.setPageSize?.(1);
  if (filter) {
    resource.setFilter?.(filter);
  }
  await resource.refresh();
  return resource.getCount?.() ?? resource.getMeta?.()?.count ?? 0;
}

try {
  const [activeTasks, pendingTasks, doneTasks] = await Promise.all([
    countRecords('tasks', { status: { $eq: 'active' } }),
    countRecords('tasks', { status: { $eq: 'pending' } }),
    countRecords('tasks', { status: { $eq: 'done' } }),
  ]);

  const metrics = [
    { key: 'active', title: ctx.t('Active tasks'), value: activeTasks },
    { key: 'pending', title: ctx.t('Pending tasks'), value: pendingTasks },
    { key: 'done', title: ctx.t('Done tasks'), value: doneTasks },
  ];

  ctx.render(
    <Row gutter={[12, 12]}>
      {metrics.map((metric) => (
        <Col key={metric.key} xs={24} sm={12} lg={8}>
          <Card size="small">
            <Statistic title={metric.title} value={metric.value} />
          </Card>
        </Col>
      ))}
    </Row>,
  );
} catch (error) {
  ctx.render(
    <Alert
      type="error"
      showIcon
      message={ctx.t('Failed to load metrics')}
      description={String(error?.message || error)}
    />,
  );
}
```

## Editable slots
- Replace `tasks` with the target collection name.
- Replace each `filter` with a server-side resource filter object, for example `{ status: { $eq: '新收集' } }`.
- Replace metric titles and responsive column spans to match the dashboard layout.

## Skill-mode notes
Use this for numeric summary values. Do not use GridCard for count-only metrics, because GridCard renders records rather than aggregate numbers.
