# NocoBase JS Snippets — Official Templates

> Source: NocoBase flow-engine snippets (`nocobase/packages/core/flow-engine/src/runjs-context/snippets/`)

---

## Block Snippets (JSBlock)

### ECharts Pie Chart
```js
const container = document.createElement('div');
container.style.height = '400px';
container.style.width = '100%';
ctx.render(container);
const echarts = await ctx.requireAsync('echarts@5/dist/echarts.min.js');
if (!echarts) throw new Error('ECharts library not loaded');

const chart = echarts.init(container);
chart.setOption({
  title: { text: ctx.t('ECharts') },
  series: [{ type: 'pie', data: [{ value: 1, name: ctx.t('A') }] }],
});
chart.resize();
```

### Chart.js Bar Chart
```js
const wrapper = document.createElement('div');
wrapper.style.padding = '16px';
wrapper.style.background = '#fff';
wrapper.style.borderRadius = '8px';
wrapper.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';

const canvas = document.createElement('canvas');
canvas.width = 480;
canvas.height = 320;
wrapper.appendChild(canvas);
ctx.render(wrapper);

async function renderChart() {
  const loaded = await ctx.requireAsync('chart.js@4.4.0/dist/chart.umd.min.js');
  const Chart = loaded?.Chart || loaded?.default?.Chart || loaded?.default;
  if (!Chart) throw new Error('Chart.js is not available');

  new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      datasets: [{
        label: ctx.t('Daily visits'),
        data: [12, 18, 9, 15, 22],
        backgroundColor: 'rgba(24, 144, 255, 0.6)',
        borderColor: '#1890ff',
        borderWidth: 1,
      }],
    },
    options: {
      plugins: {
        legend: { display: true },
        title: { display: true, text: ctx.t('Weekly overview') },
      },
    },
  });
}
renderChart().catch(error => {
  wrapper.innerHTML = '<div style="color:#c00;">' + (error?.message || ctx.t('Chart initialization failed')) + '</div>';
});
```

### Statistics Cards (antd Statistic)
```jsx
const { Card, Statistic, Row, Col } = ctx.libs.antd;

const res = await ctx.request({
  url: 'users:list',
  method: 'get',
  params: { pageSize: 100, appends: ['roles'] },
});
const users = res?.data?.data || [];

const total = users.length;
const adminCount = users.filter(u =>
  Array.isArray(u?.roles) && u.roles.some(r => r?.name === 'admin')
).length;
const withEmail = users.filter(u => !!u?.email).length;
const distinctRoles = new Set(
  users.flatMap(u => (Array.isArray(u?.roles) ? u.roles.map(r => r?.name) : []))
    .filter(Boolean)
).size;

ctx.render(
  <Row gutter={16}>
    <Col span={6}><Card><Statistic title={ctx.t('Total users')} value={total} valueStyle={{ color: '#3f8600' }} /></Card></Col>
    <Col span={6}><Card><Statistic title={ctx.t('Administrators')} value={adminCount} valueStyle={{ color: '#1890ff' }} /></Card></Col>
    <Col span={6}><Card><Statistic title={ctx.t('Users with email')} value={withEmail} valueStyle={{ color: '#faad14' }} /></Card></Col>
    <Col span={6}><Card><Statistic title={ctx.t('Distinct roles')} value={distinctRoles} valueStyle={{ color: '#cf1322' }} /></Card></Col>
  </Row>
);
```

### Timeline from Records
```jsx
const { Timeline, Card } = ctx.libs.antd;

const res = await ctx.request({
  url: 'users:list',
  method: 'get',
  params: { pageSize: 20, sort: ['-createdAt'] },
});
const records = res?.data?.data || [];

if (!records.length) {
  ctx.render('<div style="padding:16px;color:#999;">' + ctx.t('No data') + '</div>');
  return;
}

ctx.render(
  <Card title={ctx.t('Activity Timeline')} bordered>
    <Timeline mode="left">
      {records.map(record => (
        <Timeline.Item key={record.id} label={record.createdAt ? new Date(record.createdAt).toLocaleString() : ''}>
          <div>
            <strong>{record.nickname || record.username || ctx.t('Unnamed')}</strong>
            {record.email ? <div style={{ color: '#999', fontSize: '12px', marginTop: '4px' }}>{record.email}</div> : null}
          </div>
        </Timeline.Item>
      ))}
    </Timeline>
  </Card>
);
```

### Info Card (Descriptions)
```jsx
const { Card, Descriptions, Tag } = ctx.libs.antd;

if (!ctx.record) {
  ctx.render('<div style="padding:16px;color:#999;">' + ctx.t('No record data') + '</div>');
  return;
}
const record = ctx.record;

ctx.render(
  <Card title={ctx.t('Record Details')} bordered style={{ margin: 0 }}>
    <Descriptions column={2} size="small">
      <Descriptions.Item label={ctx.t('ID')}>{record.id || '-'}</Descriptions.Item>
      <Descriptions.Item label={ctx.t('Status')}>
        <Tag color={record.status === 'active' ? 'green' : 'default'}>{record.status || '-'}</Tag>
      </Descriptions.Item>
      <Descriptions.Item label={ctx.t('Title')}>{record.title || '-'}</Descriptions.Item>
      <Descriptions.Item label={ctx.t('Created At')}>
        {record.createdAt ? new Date(record.createdAt).toLocaleString() : '-'}
      </Descriptions.Item>
    </Descriptions>
  </Card>
);
```

### Fetch & Render HTML List
```js
const { data } = await ctx.request({
  url: 'users:list',
  method: 'get',
  params: { pageSize: 5 },
});
const rows = Array.isArray(data?.data) ? data.data : [];

ctx.render([
  '<div style="padding:12px">',
  '<h4>' + ctx.t('Users') + '</h4>',
  '<ul style="margin:0; padding-left:20px">',
  ...rows.map((r, i) => '<li>#' + (i+1) + ': ' + String(r?.nickname ?? r?.username ?? r?.id ?? '') + '</li>'),
  '</ul>',
  '</div>'
].join(''));
```

### React Button with Handler
```jsx
const { Button } = ctx.libs.antd;
ctx.render(
  <div style={{ padding: 12 }}>
    <Button type="primary" onClick={() => ctx.message.success(ctx.t('Clicked!'))}>
      {ctx.t('Click')}
    </Button>
  </div>
);
```

### Resource Example (makeResource)
```js
const resource = ctx.makeResource('SingleRecordResource');
resource.setDataSourceKey('main');
resource.setResourceName('users');
await resource.refresh();

ctx.render(`
  <pre style="padding: 12px; background: #f5f5f5; border-radius: 6px;">
    ${JSON.stringify(resource.getData(), null, 2)}
  </pre>
`);
```

---

## Detail/Field Snippets (JSField)

### Percentage Bar
```js
const value = Number(ctx.value ?? 0);
if (!Number.isFinite(value)) { ctx.render('-'); return; }

const percent = Math.max(0, Math.min(100, value));
const getColor = val => val >= 80 ? '#52c41a' : val >= 50 ? '#faad14' : '#f5222d';
const color = getColor(percent);

ctx.render(`
  <div style="display: flex; align-items: center; gap: 8px;">
    <div style="flex: 1; height: 8px; background: #f0f0f0; border-radius: 4px; overflow: hidden;">
      <div style="width: ${percent}%; height: 100%; background: ${color}; transition: width 0.3s ease;"></div>
    </div>
    <span style="color: ${color}; font-weight: 500; min-width: 45px; text-align: right;">${percent.toFixed(1)}%</span>
  </div>
`);
```

### Status Tag
```js
const statusColors = { active: 'green', pending: 'orange', inactive: 'gray', error: 'red', success: 'blue' };
const status = String(ctx.value || 'unknown');
const color = statusColors[status] || 'default';

ctx.render(`
  <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px;
    background-color: var(--${color}-1, #f0f0f0); color: var(--${color}-6, #333);
    border: 1px solid var(--${color}-3, #d9d9d9);">
    ${ctx.t(status)}
  </span>
`);
```

### Color by Value (number sign)
```js
const n = Number(ctx.value ?? 0);
const color = Number.isFinite(n) ? (n > 0 ? 'green' : n < 0 ? 'red' : '#999') : '#555';
ctx.render('<span style=' + JSON.stringify('color:' + color) + '>' + String(ctx.value ?? '') + '</span>');
```

### Relative Time
```js
const formatRelativeTime = date => {
  const diff = new Date() - new Date(date);
  const s = Math.floor(diff/1000), m = Math.floor(s/60), h = Math.floor(m/60), d = Math.floor(h/24);
  if (s < 60) return ctx.t('just now');
  if (m < 60) return m + ' minutes ago';
  if (h < 24) return h + ' hours ago';
  if (d < 30) return d + ' days ago';
  return Math.floor(d/30) + ' months ago';
};

const dateStr = ctx.value;
if (!dateStr) { ctx.render('-'); return; }
const fullDate = new Date(dateStr).toLocaleString();
ctx.render(`<span title="${fullDate}" style="cursor:help;color:#666;">${formatRelativeTime(dateStr)}</span>`);
```

---

## Form Snippets (JSItem — Linkage)

### Calculate Total (quantity x price)
```js
const quantity = Number(ctx.record?.quantity) || 0;
const unitPrice = Number(ctx.record?.unitPrice) || 0;
const total = quantity * unitPrice;

const items = ctx.model?.subModels?.grid?.subModels?.items;
const candidates = Array.isArray(items) ? items : Array.from(items?.values?.() || items || []);
const totalField = candidates.find(item => item?.props?.name === 'totalPrice');
if (totalField) totalField.setProps({ value: total.toFixed(2) });
```

### Set Field Value
```js
const targetFieldUid = 'FIELD_UID_OR_NAME';
const nextValue = ctx.record?.status ?? ctx.t('Updated value');

const items = ctx.model?.subModels?.grid?.subModels?.items;
const candidates = Array.isArray(items) ? items : Array.from(items?.values?.() || items || []);
const fieldModel = candidates.find(item => item?.uid === targetFieldUid) ||
  candidates.find(item => item?.props?.name === targetFieldUid);
if (fieldModel) fieldModel.setProps({ value: nextValue });
```

### Toggle Visibility
```js
const targetFieldUid = 'FIELD_UID_OR_NAME';
const shouldHide = true;

const items = ctx.model?.subModels?.grid?.subModels?.items;
const candidates = Array.isArray(items) ? items : Array.from(items?.values?.() || items || []);
const fieldModel = candidates.find(item => item?.uid === targetFieldUid) ||
  candidates.find(item => item?.props?.name === targetFieldUid);
if (fieldModel) fieldModel.setProps({ hiddenModel: shouldHide });
```

---

## Global Snippets

### API Request
```js
const { data } = await ctx.request({ url: 'COLLECTION:list', method: 'get', params: { pageSize: 10 } });
const rows = data?.data || [];
```

### Require AMD/UMD
```js
const lib = await ctx.requireAsync('PACKAGE@VERSION/dist/FILE.min.js');
```

### Import ESM
```js
const module = await ctx.importAsync('PACKAGE@VERSION');
```

### Success/Error Messages
```js
ctx.message.success(ctx.t('Operation successful'));
ctx.message.error(ctx.t('Something went wrong'));
```

### Notification
```js
ctx.notification.open({
  message: ctx.t('Notification Title'),
  description: ctx.t('Detailed description here'),
});
```

### Open Dialog/Drawer
```js
// Dialog
await ctx.openView({ type: 'dialog', componentName: 'COMPONENT_NAME' });
// Drawer
await ctx.openView({ type: 'drawer', componentName: 'COMPONENT_NAME' });
```

### Clipboard
```js
await navigator.clipboard.writeText('text to copy');
ctx.message.success(ctx.t('Copied'));
```
