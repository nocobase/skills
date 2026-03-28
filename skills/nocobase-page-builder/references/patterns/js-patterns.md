# JS Code Patterns

For the complete sandbox API reference, see `ref/js-sandbox.md`. For official snippet templates, see `ref/js-snippets.md`.

## Quick Reference

| Capability | Usage |
|------------|-------|
| Built-in React + antd | `ctx.libs.antd`, `ctx.libs.React` (or `ctx.antd`, `ctx.React`) |
| Write JSX directly | `ctx.render(<Button>Click</Button>)` — auto-compiled |
| ECharts | `await ctx.requireAsync('echarts@5/dist/echarts.min.js')` |
| Chart.js | `await ctx.requireAsync('chart.js@4.4.0/dist/chart.umd.min.js')` |
| Hooks (useState, etc.) | `const { useState } = ctx.libs.React;` then use inside components |
| Data requests | `await ctx.request({url:'COLL:list', method:'get', params:{...}})` |
| dayjs | `ctx.libs.dayjs()` |
| lodash | `ctx.libs.lodash.get(obj, path)` |
| DOM creation (for chart libs) | `document.createElement('div')` + `ctx.render(container)` |

## Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| `ctx.charts` / `ctx.echarts` / `ctx.g2` | `ctx.requireAsync('echarts@5/...')` | Not built-in, must load via CDN |
| `ctx.dataSource` / `ctx.utils` | `ctx.request({url, params})` | Use ctx.request |
| `api.collection('x').list()` | `ctx.request({url:'x:list'})` | No ORM-style API available |
| `filter[field]=value` query string | `params:{filter:{field:{$op:'val'}}}` | NocoBase uses JSON filter |
| `r.department` (M2O field) | `r.department?.name` | M2O returns an object, not a string |
| Hardcoded data | `ctx.request()` live query | Data must be fetched from the database |

## Data Requests

```js
// List query
const { data } = await ctx.request({
  url: 'COLLECTION:list',
  method: 'get',
  params: { pageSize: 200, sort: ['-createdAt'], filter: { status: 'active' } }
});
const items = data?.data || [];

// Filter operators
// Date: $dateAfter, $dateBefore, $dateOn
// Number: $gt, $gte, $lt, $lte
// String: $includes, $notIncludes, $eq, $ne
```

## M2O Relation Fields

```js
// M2O fields return objects {id, name, ...}, not strings
const dept = r.department?.name || '-';

// Mixed field helper
const v = f => { const x = r[f]; return typeof x === 'object' && x ? (x.name || x.title || '') : x; };
```

---

## Pattern: ECharts Pie

```js
const container = document.createElement('div');
container.style.height = '300px';
container.style.width = '100%';
ctx.render(container);

const echarts = await ctx.requireAsync('echarts@5/dist/echarts.min.js');
if (!echarts) throw new Error('ECharts not loaded');

const { data } = await ctx.request({ url: 'COLLECTION:list', method: 'get', params: { pageSize: 500 } });
const items = data?.data || [];

// Group by field and count
const counts = {};
items.forEach(i => { const v = i.FIELD?.name || i.FIELD || '(empty)'; counts[v] = (counts[v]||0) + 1; });
const pieData = Object.entries(counts).map(([name, value]) => ({ name, value }));

const chart = echarts.init(container);
chart.setOption({
  tooltip: { trigger: 'item' },
  series: [{ type: 'pie', radius: '60%', data: pieData, label: { formatter: '{b}: {c} ({d}%)' } }]
});
chart.resize();
```

## Pattern: ECharts Bar

```js
const container = document.createElement('div');
container.style.height = '300px';
container.style.width = '100%';
ctx.render(container);

const echarts = await ctx.requireAsync('echarts@5/dist/echarts.min.js');
const { data } = await ctx.request({ url: 'COLLECTION:list', method: 'get', params: { pageSize: 500 } });
const items = data?.data || [];

const counts = {};
items.forEach(i => { const v = i.FIELD?.name || i.FIELD || '(empty)'; counts[v] = (counts[v]||0) + 1; });
const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);

const chart = echarts.init(container);
chart.setOption({
  tooltip: {},
  xAxis: { type: 'category', data: sorted.map(s => s[0]), axisLabel: { rotate: 30 } },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: sorted.map(s => s[1]), itemStyle: { color: '#1890ff' } }]
});
chart.resize();
```

## Pattern: ECharts Line (Trend)

```js
const container = document.createElement('div');
container.style.height = '300px';
container.style.width = '100%';
ctx.render(container);

const echarts = await ctx.requireAsync('echarts@5/dist/echarts.min.js');
const { data } = await ctx.request({ url: 'COLLECTION:list', method: 'get', params: { pageSize: 1000 } });
const items = data?.data || [];

// Count by month
const now = new Date(); const months = [];
for (let i = 5; i >= 0; i--) {
  const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
  months.push({ key: d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'), label: 'M' + (d.getMonth()+1) });
}
const counts = months.map(m => items.filter(i => (i.createdAt||'').startsWith(m.key)).length);

const chart = echarts.init(container);
chart.setOption({
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: months.map(m => m.label) },
  yAxis: { type: 'value' },
  series: [{ type: 'line', data: counts, smooth: true, areaStyle: { opacity: 0.3 } }]
});
chart.resize();
```

## Pattern: ECharts Funnel

```js
const container = document.createElement('div');
container.style.height = '300px';
container.style.width = '100%';
ctx.render(container);

const echarts = await ctx.requireAsync('echarts@5/dist/echarts.min.js');
const { data } = await ctx.request({ url: 'COLLECTION:list', method: 'get', params: { pageSize: 500 } });
const items = data?.data || [];

const stages = ['STAGE1','STAGE2','STAGE3','STAGE4','STAGE5'];
const funnelData = stages.map(s => ({ name: s, value: items.filter(i => i.STAGE_FIELD === s).length }));

const chart = echarts.init(container);
chart.setOption({
  tooltip: { trigger: 'item' },
  series: [{ type: 'funnel', left: '10%', width: '80%', data: funnelData, label: { formatter: '{b}: {c}' } }]
});
chart.resize();
```

## Pattern: Statistics Cards (JSX)

```jsx
const { Card, Statistic, Row, Col } = ctx.libs.antd;

const { data } = await ctx.request({ url: 'COLLECTION:list', method: 'get', params: { pageSize: 500 } });
const items = data?.data || [];

const total = items.length;
const activeCount = items.filter(i => i.status === 'active').length;
const amount = items.reduce((s, i) => s + (Number(i.AMOUNT_FIELD) || 0), 0);

ctx.render(
  <Row gutter={16}>
    <Col span={8}><Card><Statistic title="Total" value={total} valueStyle={{ color: '#1890ff' }} /></Card></Col>
    <Col span={8}><Card><Statistic title="Active" value={activeCount} valueStyle={{ color: '#52c41a' }} /></Card></Col>
    <Col span={8}><Card><Statistic title="Amount" value={'$' + amount.toLocaleString()} valueStyle={{ color: '#faad14' }} /></Card></Col>
  </Row>
);
```

## Pattern: Distribution (antd Progress bars — no ECharts needed)

```js
(async()=>{const h=ctx.React.createElement;const{Progress}=ctx.antd;
const colors=['#1890ff','#52c41a','#faad14','#ff4d4f','#722ed1','#13c2c2'];
try{const r=await ctx.api.request({url:'COLLECTION:list',params:{paginate:false}});
const items=r?.data?.data||[];const counts={};
items.forEach(i=>{const v=i.FIELD?.name||i.FIELD||'(empty)';counts[v]=(counts[v]||0)+1;});
const total=items.length||1;
const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
ctx.render(h('div',{style:{padding:'4px 0'}},
  sorted.map(([label,count],i)=>h('div',{key:i,style:{display:'flex',alignItems:'center',marginBottom:6,gap:8}},
    h('div',{style:{width:64,fontSize:12,color:'#666',textAlign:'right',flexShrink:0}},label),
    h('div',{style:{flex:1}},h(Progress,{percent:Math.round(count/total*100),strokeColor:colors[i%colors.length],size:'small',format:()=>count}))
  ))));
}catch(e){ctx.render(h('div',null,'...'));}})();
```

## Pattern: Alert List

```js
(async()=>{const h=ctx.React.createElement;const{List,Tag}=ctx.antd;
try{const r=await ctx.api.request({url:'COLLECTION:list',params:{paginate:false,filter:{FILTER_FIELD:'FILTER_VALUE'}}});
const items=(r?.data?.data||[]).slice(0,5);
ctx.render(h(List,{size:'small',dataSource:items,renderItem:item=>
  h(List.Item,null,h('div',{style:{display:'flex',justifyContent:'space-between',width:'100%'}},
    h('span',{style:{fontSize:12}},item.NAME_FIELD),
    h(Tag,{color:'red',style:{fontSize:11}},item.TAG_FIELD)))
}));}catch(e){ctx.render(h('div',null,'...'));}})();
```

## Pattern: Profile Card (detail item)

```js
const h=ctx.React.createElement;const{Tag,Statistic,Row,Col}=ctx.antd;
const r=ctx.record||{};
const days=Math.floor((Date.now()-new Date(r.createdAt))/86400000);
ctx.render(h('div',{style:{padding:8}},
  h(Row,{gutter:12},
    h(Col,{span:6},h(Tag,{color:'blue'},r.FIELD1||'-')),
    h(Col,{span:6},h(Tag,{color:'green'},r.FIELD2||'-')),
    h(Col,{span:6},h(Tag,null,r.FIELD3||'-')),
    h(Col,{span:6},h(Statistic,{title:'Days',value:days,valueStyle:{fontSize:14}}))
  )
));
```

## Pattern: Event (stage to field mapping)

```js
const vals=ctx.form?.values||{};
const map={STAGE1:10,STAGE2:30,STAGE3:50,STAGE4:70,STAGE5:90,STAGE6:100};
if(vals.stage&&map[vals.stage]!==undefined){ctx.form.setFieldsValue({probability:map[vals.stage]});}
```

Replace COLLECTION, FIELD, AMOUNT_FIELD, STATUS_FIELD, STAGE_FIELD, etc. with actual values.

---

## Sandbox Gotchas (2026-03-27 hands-on summary)

> For Chart-related gotchas and templates, see `ref/chart-patterns.md`.

### Spread syntax is not available

```js
// ❌
ctx.t(key, { ns: 'nb_crm', ...opts })

// ✅
ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts))
```

### Getting the current user ID

```js
// ❌ ctx.currentUser is a proxy object, passing it to a filter throws an error
var userId = ctx.currentUser?.id;

// ✅
var userId = await ctx.getVar('ctx.user.id');
```

### Getting URL parameters

```js
// ❌ window.location.search is blocked by the sandbox
// ❌ URLSearchParams is not on the allowlist

// ✅
var search = ctx.router.state.location.search || '';
var match = search.match(/[?&]status=([^&]*)/);
var status = match ? decodeURIComponent(match[1]) : null;
```

### flowSql:run's $dateBetween must be an array

See `ref/chart-patterns.md` — Sandbox Gotchas section.

---

## Pattern: Unified KPI Card (consistent style)

```js
var kpiStyle = {
  borderRadius: 12, padding: '16px 20px', background: '#fff',
  border: '1px solid #f0f0f0', minHeight: 90, cursor: 'pointer'
};
var label = { fontSize: '0.8rem', fontWeight: 500, color: '#666', marginBottom: 4 };
var val = function(color) {
  return { fontSize: '1.6rem', fontWeight: 700, color: color, letterSpacing: '-0.02em' };
};
var sfx = { fontSize: '0.75rem', color: '#999', marginLeft: 4 };
var fmt = function(v) {
  var n = Number(v) || 0;
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
};

// Colors (Tailwind): #3b82f6 #6366f1 #8b5cf6 #22c55e #10b981 #f59e0b #ef4444

React.createElement('div', { style: kpiStyle, onClick: function() { ctx.router.navigate('/admin/xxx'); } },
  React.createElement('div', { style: label }, 'Title'),
  React.createElement('div', { style: { display: 'flex', alignItems: 'baseline' } },
    React.createElement('span', { style: val('#3b82f6') }, fmt(123456)),
    React.createElement('span', { style: sfx }, 'USD')
  )
)
```

For chart templates (pie/bar/line/funnel/scatter/gauge) and events, see `ref/chart-patterns.md`.

---

## Pattern: Cross-Block Filtering (initResource)

Give a JS Block its own `ctx.resource` so other blocks can filter it via `addFilterGroup`.

```js
// Block B: Initialize resource
ctx.initResource('MultiRecordResource');
ctx.resource.setResourceName('my_collection');
ctx.resource.setPageSize(500);
ctx.resource.setAppends(['customer', 'owner']);

// Block B: Listen for filter changes
ctx.resource.on('refresh', function() {
  var data = ctx.resource.getData() || [];
  setData(data);
});
await ctx.resource.refresh();

// Block A: Filter Block B
var target = ctx.engine.getModel('block-b-uid');
target.resource.addFilterGroup(ctx.model.uid, { stage: { $eq: 'won' } });
await target.resource.refresh();
```

---

## Pattern: Stats Filter with URL Params

JS filter buttons that read URL parameters for auto-selection and sync with the table below.

```js
var TARGET_BLOCK_UID = 'table-block-uid';
var search = ctx.router.state.location.search || '';
var match = search.match(/[?&]status=([^&]*)/);
var initStatus = match ? decodeURIComponent(match[1]) : null;
var INIT_KEY = STATS.find(function(s) { return s.key === initStatus; }) ? initStatus : 'all';

// Auto-apply on first render
var appliedRef = ctx.React.useRef(false);
useEffect(function() {
  if (!appliedRef.current && INIT_KEY !== 'all') {
    appliedRef.current = true;
    var stat = STATS.find(function(s) { return s.key === INIT_KEY; });
    if (stat) setTimeout(function() { applyFilter(stat); }, 500);
  }
}, []);
```

---

## Python: Read/Write flowModel

```python
import requests, json

# Login
r = requests.post(f"{BASE}/api/auth:signIn", json={"account":"admin@nocobase.com","password":"admin123"})
TOKEN = r.json()["data"]["token"]
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

# Read JS Block
r = requests.get(f"{BASE}/api/flowModels:get?filterByTk={uid}", headers=H)
node = r.json()["data"]
code = node["stepParams"]["jsSettings"]["runJs"]["code"]

# Save (must pass all fields)
requests.post(f"{BASE}/api/flowModels:save", json={
    "uid": uid, "use": node["use"],
    "parentId": node["parentId"], "sortIndex": node["sortIndex"],
    "subKey": node["subKey"], "subType": node["subType"],
    "stepParams": node["stepParams"],
}, headers=H)
```

For chart read/write and flowSql:save, see `ref/chart-patterns.md`.

### Python f-string Pitfall

```python
# ❌ f-string escapes JS ${} → \${}
code = f"return `${{value}}`"

# ✅ Raw string or concatenation
code = r"return `${value}`"
code = "return `" + "${value}" + "`"
```
