# NocoBase Chart Patterns — Complete ChartBlockModel Guide

> Compiled from hands-on experience as of 2026-03-27. Every rule has a real pitfall behind it.

---

## Chart Architecture

```
ChartBlockModel
  stepParams.chartSettings.configure:
    query:
      mode: "sql"
      sql: "SELECT ..."          ← SQL query (supports Jinja template variables)
    chart:
      option:
        mode: "custom"
        raw: "return { ... }"    ← ECharts option builder JS (ctx.data.objects available)
      events:
        mode: "custom"
        raw: "chart.on(...)"     ← ECharts instance event bindings
```

**Two-step save**:
1. `flowModels:save` — save the node structure
2. `flowSql:save` — save the SQL template (**required! otherwise returns null**)

```python
requests.post(f"{BASE}/api/flowModels:save", json={...}, headers=H)
requests.post(f"{BASE}/api/flowSql:save", json={
    "uid": chart_uid, "sql": sql_string, "dataSourceKey": "main"
}, headers=H)
```

---

## option.raw Writing Rules

### Rule 1: Use function(){}, not arrow functions

```js
// ❌ Arrow functions — unstable in Chart raw, causes blank/gray charts
data.map(d => d.value)
formatter: (p) => p.name
itemStyle: { color: p => colors[p.dataIndex] }

// ✅ Traditional functions
data.map(function(d) { return d.value; })
formatter: function(p) { return p.name; }
```

### Rule 2: Use data array + inline itemStyle, not dataset + encode

The dataset + encode pattern breaks function-based coloring (everything turns gray).

```js
// ❌ dataset + encode + function coloring
return {
  dataset: { source: ctx.data.objects },
  series: [{
    encode: { itemName: 'name', value: 'value' },
    itemStyle: { color: function(p) { return colors[p.dataIndex]; } }
  }]
}

// ✅ data array + inline itemStyle
var data = ctx.data.objects || [];
var pieData = data.map(function(d, i) {
  return {
    name: d.name,
    value: Number(d.value || 0),
    itemStyle: { color: colors[i % colors.length] }
  };
});
return {
  series: [{ type: 'pie', data: pieData }]
}
```

### Rule 3: series.data must be plain numbers (with category axis)

When xAxis uses `data` to provide categories, series.data must be a plain number array.

```js
// ❌ Tuples — won't render
xAxis: { type: 'category', data: months },
series: [{ data: data.map(function(d) { return ['', Number(d.rev)]; }) }]

// ✅ Plain numbers
xAxis: { type: 'category', data: months },
series: [{ data: data.map(function(d) { return Number(d.rev); }) }]
```

### Rule 4: areaStyle blocks bar chart click events

A line chart's `areaStyle` (gradient area fill) on an upper layer blocks click events on bar charts below.

```js
// ❌ In bar+line combo, the line's areaStyle blocks bar click events
{ type: 'line', areaStyle: { opacity: 0.3 } }

// ✅ Remove areaStyle, or only use it in pure line charts
{ type: 'line' }  // No areaStyle in bar+line combos
```

---

## Unified Style Guidelines

### Color Palette (Tailwind)

```
Blue   #3b82f6    Indigo #6366f1    Purple #8b5cf6
Green  #22c55e    Teal   #10b981
Amber  #f59e0b    Red    #ef4444    Gray   #999
```

### Common Layout

```js
return {
  title: { text: 'Title', left: 'center' },          // Centered title
  tooltip: { trigger: 'axis' },                        // Or 'item'
  legend: { bottom: 0 },                               // Legend at bottom
  grid: { left: '3%', right: '4%', bottom: 50, top: 60, containLabel: true },
  // ...
}
```

### Axis Label Abbreviation

```js
axisLabel: {
  formatter: function(v) {
    return v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v;
  }
}
```

### Bar Chart Rounded Corners

```js
itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] }
```

### Donut Pie Chart

```js
series: [{
  type: 'pie',
  radius: ['35%', '65%'],
  center: ['50%', '45%'],
  itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
  label: { show: true, formatter: function(p) { return p.name + '\n' + p.percent + '%'; }, fontSize: 10 },
  emphasis: {
    label: { fontSize: 14, fontWeight: 'bold' },
    itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' }
  },
  data: pieData
}]
```

---

## SQL Template Variables

### Referencing Filter Form Variables

Requires a page-level `RootPageModel` with a `beforeRender` event flow defining `var_form1`.

```sql
{% if ctx.var_form1.date_range.length %}
  AND "createdAt" >= {{ ctx.var_form1.date_range[0] }}::timestamp
  AND "createdAt" < {{ ctx.var_form1.date_range[1] }}::timestamp + INTERVAL '1 day'
{% endif %}

{% if ctx.var_form1.owner_FIELD_UID.id %}
  AND owner_id = {{ ctx.var_form1.owner_FIELD_UID.id }}
{% endif %}
```

**Note**: The owner field's variable name includes the field UID, e.g., `owner_99b8gb9klj1`.

### Referencing defineProperties Variables

defineProperties passed via openView can be used directly in SQL:

```sql
WHERE stage = {{ ctx.selectedStage }}
```

### Pages Without a Filter Form

If the page has no FilterFormBlockModel, `ctx.var_form1` is undefined, and accessing `.date_range` will throw an error.
Two approaches:
1. Remove the Jinja filter blocks (chart displays all data)
2. Add safety checks (NocoBase Jinja does **not support** the `and` syntax — just remove the block)

### Gaps Left After Jinja Removal

When removing `{% if %}...{% endif %}`, watch for leftover gaps:
```sql
-- ❌ Gaps left after removing Jinja variables
INTERVAL ' weeks'             -- was INTERVAL '{{ ctx.var_form1.weeks }} weeks'
weighted_pipeline, as target  -- was , {{ ctx.var_form1.target }} as target

-- ✅ Fill with default values
INTERVAL '12 weeks'
weighted_pipeline, 5000000 as target
```

---

## Chart Events (events.raw)

### Navigation

```js
chart.off('click');
chart.on('click', function(params) {
    var name = params.name || params.data.name;
    if (name) ctx.router.navigate('/admin/xxx?filter=' + encodeURIComponent(name));
});
```

### Popup + defineProperties Parameter Passing

```js
chart.off('click');
chart.on('click', function(params) {
    var stage = params.name;
    ctx.openView(ctx.model.uid + '-detail', {
      mode: 'drawer',
      size: 'large',
      defineProperties: {
        selectedStage: {
          value: stage,
          meta: { title: 'Stage', type: 'string' }
        }
      }
    });
});
```

### Bar + Line Combo Chart Click

`chart.on('click', 'series', ...)` only responds to clicks on actual series elements. In bar+line combos:
- Clicking a bar triggers the bar series click
- Clicking a point on the line triggers the line series click
- Clicking blank/shadow areas does not trigger

Solution: remove the `'series'` filter.

```js
// ❌ Only triggers when clicking directly on a series element
chart.on('click', 'series', function(params) { ... });

// ✅ Triggers on any click (bar/line/blank areas)
chart.on('click', function(params) {
    var month = params.name || params.axisValue;
    if (month) ctx.router.navigate('/admin/xxx?month=' + encodeURIComponent(month));
});
```

---

## Complete Templates

### Pie Chart

```js
var data = ctx.data.objects || [];
var total = data.reduce(function(s, d) { return s + Number(d.value || 0); }, 0);
var colors = ['#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#14b8a6', '#06b6d4'];
var pieData = data.map(function(d, i) {
  return { name: d.name, value: Number(d.value || 0),
    itemStyle: { color: colors[i % colors.length] } };
});
return {
  title: { text: 'Title', subtext: 'Total ' + total, left: 'center' },
  tooltip: { trigger: 'item',
    formatter: function(p) { return p.name + ': ' + p.value + ' (' + p.percent + '%)'; }
  },
  legend: { bottom: 0, type: 'scroll' },
  series: [{
    type: 'pie', radius: ['35%', '65%'], center: ['50%', '45%'],
    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
    label: { show: true, formatter: function(p) { return p.name + '\n' + p.percent + '%'; }, fontSize: 10 },
    emphasis: { label: { fontSize: 14, fontWeight: 'bold' },
      itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' } },
    data: pieData
  }]
}
```

### Bar + Line Combo

```js
var data = ctx.data.objects || [];
return {
  title: { text: 'Title', left: 'center' },
  tooltip: { trigger: 'axis' },
  legend: { bottom: 0 },
  grid: { left: '3%', right: '4%', bottom: 50, top: 60, containLabel: true },
  xAxis: { type: 'category', data: data.map(function(d) { return d.label; }),
    axisLabel: { rotate: 45, fontSize: 10 } },
  yAxis: [
    { type: 'value', name: 'Amount',
      axisLabel: { formatter: function(v) { return v >= 1e3 ? (v/1e3).toFixed(0) + 'K' : v; } } },
    { type: 'value', name: 'Count', position: 'right' }
  ],
  series: [
    { name: 'Amount', type: 'bar',
      data: data.map(function(d) { return Number(d.amount); }),
      itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] } },
    { name: 'Count', type: 'line', yAxisIndex: 1,
      data: data.map(function(d) { return Number(d.count); }),
      itemStyle: { color: '#f59e0b' }, lineStyle: { width: 2 },
      label: { show: true, position: 'top', fontSize: 9 } }
  ]
}
```

### Funnel Chart

```js
var data = ctx.data.objects || [];
var funnelData = data.map(function(d) {
  return { name: d.stage_name, value: Number(d.count),
    itemStyle: { color: d.color || '#3b82f6' } };
});
return {
  title: { text: 'Pipeline', left: 'center' },
  tooltip: { trigger: 'item' },
  series: [{
    type: 'funnel', left: '10%', width: '80%', top: 60, bottom: 40,
    sort: 'none', gap: 2,
    label: { show: true, position: 'inside',
      formatter: function(p) { return p.name + ': ' + p.value; },
      fontSize: 12, color: '#fff' },
    itemStyle: { borderColor: '#fff', borderWidth: 1 },
    data: funnelData
  }]
}
```

### Scatter Chart

```js
var data = ctx.data.objects || [];
var colorMap = { stage1: '#3b82f6', stage2: '#22c55e', stage3: '#f59e0b' };
var scatterData = data.map(function(d) {
  return {
    value: [Number(d.x_field), Number(d.y_field), Number(d.size_field)],
    name: d.name,
    itemStyle: { color: colorMap[d.stage] || '#999' }
  };
});
return {
  title: { text: 'Scatter', left: 'center' },
  tooltip: { trigger: 'item',
    formatter: function(p) { return p.name + '<br/>X: ' + p.value[0] + '<br/>Y: ' + p.value[1]; } },
  xAxis: { type: 'value', name: 'X Axis' },
  yAxis: { type: 'value', name: 'Y Axis' },
  series: [{
    type: 'scatter', data: scatterData,
    symbolSize: function(val) { return Math.max(8, Math.min(val[2] || 10, 40)); }
  }]
}
```

### Gauge Chart

```js
var data = ctx.data.objects[0] || {};
var rate = Number(data.achievement_rate) || 0;
return {
  series: [{
    type: 'gauge', startAngle: 200, endAngle: -20,
    min: 0, max: 150,
    detail: { formatter: function(v) { return v.toFixed(1) + '%'; }, fontSize: 24, offsetCenter: [0, '60%'] },
    data: [{ value: rate, name: 'Achievement' }],
    axisLine: {
      lineStyle: { width: 20,
        color: [[0.3, '#ef4444'], [0.7, '#f59e0b'], [1, '#22c55e']] }
    },
    pointer: { length: '60%', width: 6 }
  }]
}
```

---

## Building Popup Content (API Pre-Creation)

Node tree for Chart / JS Block inside an openView popup:

```
PopupActionModel (uid = popupUid)        ← subKey MUST equal the popupUid itself
  └── ChildPageModel                     ← pageSettings.general.enableTabs = true
      └── ChildPageTabModel
          └── BlockGridModel
              ├── ChartBlockModel        ← Chart block
              └── JSBlockModel           ← JS block
```

**Key pitfalls**:
- `PopupActionModel.subKey` must equal the popup UID, not `"openView"`
- `PopupActionModel.stepParams` must contain `popupSettings.openView`
- `ChildPageModel.stepParams` must contain `pageSettings.general.enableTabs: true`
- Chart blocks require an additional `flowSql:save` call

---

## Python Batch Operations

### Create Chart + Save SQL

```python
import random, string
def uid():
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=11))

chart_uid = uid()
sql = "SELECT ..."
raw = "var data = ctx.data.objects || []; return { ... }"

# 1. Save node
requests.post(f"{BASE}/api/flowModels:save", json={
    "uid": chart_uid, "use": "ChartBlockModel", "parentId": grid_uid,
    "sortIndex": 1, "subKey": "items", "subType": "array",
    "stepParams": {"chartSettings": {"configure": {
        "query": {"mode": "sql", "sql": sql},
        "chart": {"option": {"mode": "custom", "raw": raw},
                  "events": {"mode": "custom", "raw": "chart.on('click', function(p) { ... });"}}
    }}}
}, headers=H)

# 2. Save SQL (required!)
requests.post(f"{BASE}/api/flowSql:save", json={
    "uid": chart_uid, "sql": sql, "dataSourceKey": "main"
}, headers=H)
```

### Batch Fix Chart raw

```python
import re

ALL_CHART_UIDS = [...]
for uid in ALL_CHART_UIDS:
    r = requests.get(f"{BASE}/api/flowModels:get?filterByTk={uid}", headers=H)
    node = r.json()["data"]
    raw = node["stepParams"]["chartSettings"]["configure"]["chart"]["option"]["raw"]

    # Scan for common issues
    issues = []
    if re.findall(r'\.\w+function\(', raw):   issues.append('.mapfunction(')    # Agent corrupted code
    if 'function((' in raw:                    issues.append('double paren')
    if '...opts' in raw:                       issues.append('spread')
    if "INTERVAL ' " in raw:                   issues.append('empty interval')   # Leftover from Jinja removal
    if ", as " in raw:                         issues.append('empty column')     # Leftover from Jinja removal

    if issues:
        print(f"{uid}: {issues}")
        # Fix...
```
