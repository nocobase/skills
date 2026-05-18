---
title: JSBlockModel 参考
description: 面向 builder 的 JSBlockModel 公开 authoring 契约、RunJS 约束与默认代码模板。
---

# JSBlockModel

## 什么时候用

当页面需要一个独立、自定义展示区块，而普通区块不适合时使用：

- 横幅
- 统计卡
- KPI / 数字统计面板
- 说明面板
- 第三方可视化容器

## builder 需要记住的公开结构

新建公开写入只接受两种 authoring 形态。不要把 readback / persisted 里的 `stepParams`、`props`、`decoratorProps`、`flowRegistry` 反写进请求。

Inline form:

```json
{
  "type": "jsBlock",
  "settings": {
    "title": "KPI Cards",
    "version": "v2",
    "code": "const { Card } = ctx.libs.antd;\\nctx.render(<Card title={ctx.t('Summary')} />);"
  }
}
```

Asset reference form for whole-page `applyBlueprint`:

```json
{
  "assets": {
    "scripts": {
      "kpiCards": {
        "version": "v2",
        "code": "ctx.render(<div>Hello</div>);"
      }
    }
  },
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        {
          "type": "jsBlock",
          "script": "kpiCards",
          "settings": {
            "title": "KPI Cards"
          }
        }
      ]
    }
  ]
}
```

约束：

- Inline `code` 写在 `settings.code`，`version` 写在 `settings.version`
- Whole-page script reuse 写在 `assets.scripts.<key>.code`，block 只写 `script: "<key>"`
- 新建 JSBlock 必须显式提供 `settings.code` 或 `applyBlueprint` 的 `script` asset；不要依赖默认模板代码
- `script` 只用于 `applyBlueprint` asset reference；localized `compose` / `add-block` 直接用 `settings.code`
- 配置已有 JSBlock 时，`configure` 使用 `changes.code` / `changes.version`；不要把 `settings.code` 放进 `changes.settings`
- 禁止 top-level `code` / `version`
- 禁止手写 `stepParams`、`props`、`decoratorProps`、`flowRegistry`
- 禁止混用 `script` 与 `settings.code` / `settings.version`
- `settings` 只放 `title`、`description`、`className`、`code`、`version`
- JSBlock 运行在受限 RunJS 沙箱里，不要默认假设 `fetch`、`localStorage`、任意 `window.*` 可直接访问
- JSBlock 默认没有预绑定 `ctx.resource`；需要结构化数据时先 `ctx.initResource(...)`
- 当前登录用户优先使用 `ctx.user` 或 `ctx.auth?.user`
- collection 的 `:list` / `:get` 默认使用 resource API，不要直接写进 `ctx.request()`
- `ctx.element` 在源码里仍存在，但 skill 默认不接受直接写 `innerHTML`

## 默认写法

```jsx
const { Card, Typography } = ctx.libs.antd;
ctx.render(
  <Card title={ctx.t('Summary')}>
    <Typography.Text>{ctx.t('Content')}</Typography.Text>
  </Card>
);
```

## 需要请求数据时

如果只是显示当前登录用户，优先直接使用 `ctx.user` 或 `ctx.auth?.user`，不要先写 `/auth:check`：

```jsx
const { Card, Typography } = ctx.libs.antd;
const currentUser = ctx.user ?? ctx.auth?.user ?? null;

ctx.render(
  <Card size="small">
    <Typography.Text>
      {currentUser ? (currentUser.nickname ?? currentUser.username ?? `#${currentUser.id}`) : ctx.t('Anonymous')}
    </Typography.Text>
  </Card>
);
```

如果只是发自定义端点或 request-only 的 HTTP 请求，才默认使用 `ctx.request()`：

```jsx
const { Card, Typography } = ctx.libs.antd;
const { data } = await ctx.request({
  url: '/app:getInfo',
  method: 'get',
  skipNotify: true,
});

const appName = data?.data?.name;
ctx.render(
  <Card size="small">
    <Typography.Text>{appName || ctx.t('Unnamed app')}</Typography.Text>
  </Card>
);
```

如果要读取 collection 的列表或单条记录，默认先初始化 resource：

```jsx
const { Card, Typography } = ctx.libs.antd;
ctx.initResource('MultiRecordResource');
ctx.resource.setResourceName('tasks');
ctx.resource.setPageSize?.(10);
ctx.resource.setFilter?.({
  status: {
    $eq: 'active',
  },
});
await ctx.resource.refresh();

const rows = ctx.resource.getData() || [];
ctx.render(
  <Card size="small">
    {rows.map((row) => (
      <Typography.Text key={row.id}>{row.title ?? row.name ?? `#${row.id}`}</Typography.Text>
    ))}
  </Card>
);
```

注意：

- block payload 的 `dataScope.filter` 使用 `{ logic, items }`
- RunJS 的 `ctx.request({ params: { filter } })` / `resource.setFilter()` 使用服务端 query object

## 数字统计面板默认写法

当用户要的是 `KPI`、`指标卡`、`数字统计`、`追踪产品数`、`待阅情报数`、`本周新增数` 这类一个或多个数字时，默认生成 JSBlock 统计面板，而不是 GridCard。GridCard 是记录展示块；统计数字需要 JSBlock 主动读取 resource meta count。

Why not `actionPanel`:

- `actionPanel` expresses operations, not passive summary display.
- Metric cards are insight blocks, not action containers.
- Dashboard KPI sections should read as one visualization surface, so prefer one `jsBlock` that renders a metric panel.

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
  const startOfWeek = new Date();
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));

  const [
    trackedProducts,
    weeklyIntel,
    highImportanceIntel,
    pendingIntel,
  ] = await Promise.all([
    countRecords('ai_products', { is_tracking: { $eq: true } }),
    countRecords('intelligenceEntries', { createdAt: { $gte: startOfWeek.toISOString() } }),
    countRecords('intelligenceEntries', { importance: { $in: ['high', '高'] } }),
    countRecords('intelligenceEntries', { status: { $in: ['pending', '待阅', '新收集'] } }),
  ]);

  const cards = [
    { title: '追踪产品数', value: trackedProducts, color: '#1677ff' },
    { title: '本周新增情报', value: weeklyIntel, color: '#52c41a' },
    { title: '高重要度情报', value: highImportanceIntel, color: '#fa8c16' },
    { title: '待阅情报', value: pendingIntel, color: '#722ed1' },
  ];

  ctx.render(
    <Row gutter={[12, 12]}>
      {cards.map((item) => (
        <Col key={item.title} xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic
              title={ctx.t(item.title)}
              value={item.value}
              valueStyle={{ color: item.color }}
            />
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
      message={ctx.t('统计数据加载失败')}
      description={String(error?.message || error)}
    />,
  );
}
```

## 不要默认这么写

```js
ctx.element.innerHTML = '<div>...</div>';
await ctx.request({ url: 'tasks:list', method: 'get' });
await fetch('/api/auth:check', { credentials: 'include' });
```

其中 `innerHTML` 简单赋值也不要依赖本地自动改写；作者应显式改成 `ctx.render(...)`，复杂场景由后端聚合验证阻断。

## 何时再看别的文档

- 要加载外部库：回看 [runjs-overview.md](runjs-overview.md)
- 需要更明确的渲染规则：回看 [rendering-contract.md](rendering-contract.md)
