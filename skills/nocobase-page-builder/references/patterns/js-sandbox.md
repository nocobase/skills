# NocoBase JS Sandbox — Complete API Reference

> Source: NocoBase flow-engine RunJS docs (`nocobase/docs/dist/runjs/`)

## Overview

RunJS is the JavaScript execution environment for **JS Blocks**, **JS Fields**, **JS Columns**, **JS Items**, and **JS Actions**. Code runs in a restricted sandbox with access to `ctx` (Context API).

Key capabilities:
- Top-level `await` (no need for async IIFE wrapper)
- JSX support (auto-compiled via sucrase)
- Built-in React, Ant Design, dayjs, lodash
- External module loading (ECharts, Chart.js, Vue, etc.)
- DOM access (`document`, `window`)

---

## ctx.render() — Rendering Content

Renders into the current container (`ctx.element`). Supports 3 formats:

### JSX (Recommended)
```jsx
const { Button, Card } = ctx.libs.antd;
ctx.render(
  <Card title="Title">
    <Button type="primary">Click</Button>
  </Card>
);
```

### DOM Node (for ECharts/Chart.js)
```js
const container = document.createElement('div');
container.style.height = '400px';
container.style.width = '100%';
ctx.render(container);
// Then init chart on container
```

### HTML String
```js
ctx.render('<h1>Hello World</h1>');
```

**Notes:**
- Multiple `ctx.render()` calls REPLACE content (not append)
- HTML strings are sanitized via DOMPurify
- `ctx.element.innerHTML` is **deprecated** — always use `ctx.render()`

---

## ctx.libs — Built-in Libraries (No Import Needed)

| Property | Description |
|----------|-------------|
| `ctx.libs.React` | React core (JSX, Hooks) |
| `ctx.libs.ReactDOM` | ReactDOM client API |
| `ctx.libs.antd` | Ant Design 5 components |
| `ctx.libs.antdIcons` | Ant Design icons (PlusOutlined, UserOutlined, etc.) |
| `ctx.libs.dayjs` | Date/time utility |
| `ctx.libs.lodash` | Utility functions (get, set, debounce, etc.) |
| `ctx.libs.formula` | Excel-like formulas (SUM, AVERAGE, IF) |
| `ctx.libs.math` | Mathematical expressions |

**Top-level aliases** (legacy, still works): `ctx.React`, `ctx.ReactDOM`, `ctx.antd`, `ctx.dayjs`

### Hooks Example
```jsx
const { React } = ctx.libs;
const { useState } = React;
const { Button } = ctx.libs.antd;

const App = () => {
  const [count, setCount] = useState(0);
  return <Button onClick={() => setCount(c => c + 1)}>{count}</Button>;
};
ctx.render(<App />);
```

### Icons Example
```jsx
const { Button } = ctx.libs.antd;
const { UserOutlined } = ctx.libs.antdIcons;
ctx.render(<Button icon={<UserOutlined />}>User</Button>);
```

---

## ctx.request() — HTTP Requests

Authenticated HTTP requests with automatic baseURL, Token, locale, role.

```ts
ctx.request(options: AxiosRequestConfig & { skipNotify?, skipAuth? }): Promise<AxiosResponse>
```

### List Query
```js
const { data } = await ctx.request({
  url: 'users:list',
  method: 'get',
  params: { pageSize: 20, sort: ['-createdAt'], filter: { status: 'active' } },
});
const rows = data?.data || [];
```

### Resource URL Format
| Format | Example |
|--------|---------|
| `collection:action` | `users:list`, `users:create`, `posts:update` |
| `collection.relation:action` | `posts.comments:list` |

### Response Structure
- `response.data.data` — array of records (list) or single record
- `response.data.meta` — pagination info

---

## ctx.requireAsync() — Load UMD/AMD Libraries

Load external libraries from CDN. Ideal for **ECharts**, **Chart.js**, **FullCalendar**, **jQuery plugins**.

```js
const echarts = await ctx.requireAsync('echarts@5/dist/echarts.min.js');
const dayjs = await ctx.requireAsync('https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js');
```

- **Shorthand**: `package@version/path` → resolved via esm.sh with `?raw`
- **Full URL**: any CDN address
- **CSS**: `ctx.requireAsync('https://cdn.example.com/theme.css')` injects stylesheet

### ECharts Pattern
```js
const container = document.createElement('div');
container.style.height = '400px';
container.style.width = '100%';
ctx.render(container);

const echarts = await ctx.requireAsync('echarts@5/dist/echarts.min.js');
if (!echarts) throw new Error('ECharts not loaded');

const chart = echarts.init(container);
chart.setOption({
  title: { text: 'Sales Overview' },
  xAxis: { type: 'category', data: ['Mon','Tue','Wed','Thu','Fri'] },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: [120, 200, 150, 80, 70] }]
});
chart.resize();
```

---

## ctx.importAsync() — Load ESM Modules

For ESM modules (preferred over requireAsync when available).

```js
const Vue = await ctx.importAsync('vue@3.4.0');
const React19 = await ctx.importAsync('react@19.2.4');
const { Button } = await ctx.importAsync('antd@6.2.2?bundle');
```

---

## JSX Syntax

RunJS supports JSX directly — no import needed. Compiled via sucrase to `ctx.libs.React.createElement`.

```jsx
// Direct JSX — works without any import
ctx.render(<div style={{ padding: 16 }}>Hello</div>);

// With antd components
const { Card, Statistic, Row, Col } = ctx.libs.antd;
ctx.render(
  <Row gutter={16}>
    <Col span={8}><Card><Statistic title="Total" value={100} /></Card></Col>
    <Col span={8}><Card><Statistic title="Active" value={80} valueStyle={{ color: '#3f8600' }} /></Card></Col>
  </Row>
);
```

---

## ctx.popup — Popup Record Context

When a JS block is inside a **detail popup** (ChildPageModel), use `ctx.popup` to access the current record.

> **WARNING**: `ctx.record` does NOT work in JSBlockModel inside popups! JSBlockModel is a **sibling** of DetailsBlockModel, not its child — the delegate chain does not reach it.

### Getting the Current Record
```js
// Step 1: Get popup context (async!)
const popup = await ctx.popup;
const recordId = popup?.resource?.filterByTk;

if (!recordId) {
  ctx.render(<div style={{ color: '#999' }}>No record</div>);
  return;
}

// Step 2: Fetch full record with relations
const res = await ctx.request({
  url: 'my_collection:get',
  params: { filterByTk: recordId, appends: ['department', 'position'] }
});
const record = res?.data?.data || {};

// Step 3: Render with record data
ctx.render(<Card>{record.name}</Card>);
```

### ctx.popup Properties

| Property | Description |
|----------|-------------|
| `popup.record` | Current popup record data (all fields) |
| `popup.resource.filterByTk` | Record primary key (ID) |
| `popup.resource.collectionName` | Collection name |
| `popup.resource.dataSourceKey` | Data source (usually `"main"`) |
| `popup.sourceRecord` | Parent record (if opened from association) |
| `popup.parent` | Parent popup context (for nested popups) |
| `popup.parent.record` | Grandparent record |

### When to Use What

| Context | API | Notes |
|---------|-----|-------|
| **JSColumn** (table cell) | `ctx.record` | Row data, always available |
| **JSItem** (inside DetailsBlock) | `ctx.record` | Inherited from DetailsBlockModel via delegate chain |
| **JSBlock** (standalone, page level) | `ctx.request()` | No record context, fetch your own data |
| **JSBlock** (inside popup) | `await ctx.popup` | **Must use popup**, ctx.record is undefined |

---

## Context by Scenario

| Scenario | Available | Key Properties |
|----------|-----------|----------------|
| **JSBlock** | render, request, libs, requireAsync, importAsync, element, message, notification, modal, popup | Full rendering + data |
| **JSColumn** | render, record, value, libs | `ctx.record` = row data, `ctx.value` = cell value |
| **JSField / JSItem** | render, record, value, libs, model | Field display customization |
| **FormJSFieldItem** | render, record, value, model, form | Form field with linkage |
| **JSAction** (record) | request, record, message, modal | Record-level actions |
| **JSAction** (collection) | request, message, modal | Collection-level actions |

---

## Other ctx APIs

| API | Description |
|-----|-------------|
| `ctx.message.success(text)` | Show success toast |
| `ctx.message.error(text)` | Show error toast |
| `ctx.notification.open({message, description})` | Show notification |
| `ctx.modal.confirm({title, content, onOk})` | Show confirm dialog |
| `ctx.t(key, params?)` | i18n translation |
| `ctx.libs.dayjs()` | Current datetime |
| `ctx.libs.lodash.get(obj, path)` | Deep property access |
| `ctx.makeResource(type)` | Create data resource |
| `ctx.location` | Current URL info |
| `ctx.router` | Navigation |

---

## Global Variables

Available in all RunJS contexts:
- `window`, `document`, `navigator`, `ctx`
