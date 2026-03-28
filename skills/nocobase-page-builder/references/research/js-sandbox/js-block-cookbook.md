---
title: JS Block Code Cookbook
description: Quick reference for JS Block common patterns, KPI card templates, chart events, and Python flowModel read/write
tags: [nocobase, js-sandbox, js-block, cookbook, template, python, flowModel]
type: guide
status: active
updated: "2026-03-27"
---

# JS Block Code Cookbook

Rules distilled from extensive trial and error. **Every item has a real-world pitfall behind it.**

---

## Sandbox Syntax Rules (Hard-Won Lessons)

### Available vs Unavailable

| Syntax | v1 JSBlockModel | Chart option raw | Notes |
|--------|:---:|:---:|-------|
| `const` / `let` | ✅ | ✅ | |
| Arrow functions `=>` | ✅ | ❌ unstable | Use `function(){}` in Chart raw |
| Template literals `` ` `` | ✅ | ✅ | But Python f-strings will escape `${}` |
| Optional chaining `?.` | ✅ | ✅ | |
| Spread `...opts` | ❌ | ❌ | Use `Object.assign()` |
| `URLSearchParams` | ❌ | - | Use regex `search.match(...)` |
| `window.location.search` | ❌ | - | Use `ctx.router.state.location.search` |
| `ctx.currentUser` | ❌ proxy | - | Use `await ctx.getVar('ctx.user.id')` |
| JSX | ✅ | - | `React.createElement` also works |

### Key APIs

```js
// Current user
var userId = await ctx.getVar('ctx.user.id');

// URL parameters
var search = ctx.router.state.location.search || '';
var match = search.match(/[?&]status=([^&]*)/);
var status = match ? decodeURIComponent(match[1]) : null;

// Navigation
ctx.router.navigate('/admin/xxx?param=value');

// Popup
await ctx.openView(ctx.model.uid + '-detail', { mode: 'drawer', size: 'large' });

// Cross-block filtering
var target = ctx.engine.getModel('target-block-uid');
target.resource.addFilterGroup(ctx.model.uid, { field: { $eq: value } });
await target.resource.refresh();

// Resource initialization (give JSBlock its own resource)
ctx.initResource('MultiRecordResource');
ctx.resource.setResourceName('collection_name');
await ctx.resource.refresh();
var data = ctx.resource.getData();
```

---

## KPI Card Unified Template

All KPI cards use the same style set, written with `React.createElement` (safest):

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
```

**Color palette (Tailwind colors):**
- Blue `#3b82f6`  Indigo `#6366f1`  Violet `#8b5cf6`
- Green `#22c55e`  Emerald `#10b981`
- Amber `#f59e0b`  Red `#ef4444`

**Rendering a single card:**
```js
React.createElement('div', { style: kpiStyle, onClick: function() { ctx.router.navigate('/admin/xxx'); } },
  React.createElement('div', { style: label }, 'Pipeline Value'),
  React.createElement('div', { style: { display: 'flex', alignItems: 'baseline' } },
    React.createElement('span', { style: val('#3b82f6') }, fmt(123456)),
    React.createElement('span', { style: sfx }, 'USD')  // optional suffix
  )
)
```

**Multi-card layout (4 columns):**
```js
React.createElement(Row, { gutter: [12, 12] },
  React.createElement(Col, { xs: 12, md: 6 }, /* card 1 */),
  React.createElement(Col, { xs: 12, md: 6 }, /* card 2 */),
  React.createElement(Col, { xs: 12, md: 6 }, /* card 3 */),
  React.createElement(Col, { xs: 12, md: 6 }, /* card 4 */)
)
```

---

## Chart Option Raw Writing Rules

### Must use `function(){}`, not arrow functions

```js
// ❌ Arrow functions — unstable in Chart raw
data.map(d => d.value)
formatter: (p) => p.name

// ✅ Traditional functions
data.map(function(d) { return d.value; })
formatter: function(p) { return p.name; }
```

### Use data array + inline colors, not dataset + encode

```js
// ❌ dataset + encode + function-based coloring
dataset: { source: ctx.data.objects },
series: [{ encode: { itemName: 'name', value: 'value' },
  itemStyle: { color: function(p) { return colors[p.dataIndex]; } } }]

// ✅ data array + inline itemStyle
var pieData = data.map(function(d, i) {
  return { name: d.name, value: Number(d.value || 0),
    itemStyle: { color: colors[i % colors.length] } };
});
series: [{ data: pieData }]
```

### series.data format

```js
// ❌ category axis + tuples = won't render
xAxis: { type: 'category', data: months },
series: [{ data: data.map(function(d) { return ['', Number(d.revenue)]; }) }]

// ✅ Pure numeric values, one-to-one with xAxis.data
series: [{ data: data.map(function(d) { return Number(d.revenue); }) }]
```

### Chart click event templates

```js
// Navigation
chart.off('click');
chart.on('click', function(params) {
    var name = params.name || params.data.name;
    if (name) ctx.router.navigate('/admin/xxx?filter=' + encodeURIComponent(name));
});

// Popup + parameter passing
chart.off('click');
chart.on('click', function(params) {
    var stage = params.name;
    ctx.openView(ctx.model.uid + '-detail', {
      mode: 'drawer', size: 'large',
      defineProperties: {
        selectedStage: { value: stage, meta: { title: 'Stage', type: 'string' } }
      }
    });
});
```

### SQL template variables

```sql
-- Reference defineProperties variables in Chart SQL
WHERE stage = {{ ctx.selectedStage }}

-- Reference filter form variables (requires page-level beforeRender event flow defining var_form1)
{% if ctx.var_form1.date_range.length %}
  AND "createdAt" >= {{ ctx.var_form1.date_range[0] }}::timestamp
{% endif %}
```

---

## Python flowModel Operations Quick Reference

### Login

```python
import requests, json
r = requests.post("http://localhost:14202/api/auth:signIn",
    json={"account":"admin@nocobase.com","password":"admin123"})
TOKEN = r.json()["data"]["token"]
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
```

### Read a block

```python
r = requests.get(f"{BASE}/api/flowModels:get?filterByTk={uid}", headers=H)
node = r.json()["data"]

# JS Block
code = node["stepParams"]["jsSettings"]["runJs"]["code"]
version = node["stepParams"]["jsSettings"]["runJs"]["version"]  # "v1"

# Chart Block
sql = node["stepParams"]["chartSettings"]["configure"]["query"]["sql"]
raw = node["stepParams"]["chartSettings"]["configure"]["chart"]["option"]["raw"]
events = node["stepParams"]["chartSettings"]["configure"]["chart"].get("events", {})
```

### Save a block

```python
# Must pass the complete node properties
requests.post(f"{BASE}/api/flowModels:save", json={
    "uid": uid, "use": node["use"],
    "parentId": node["parentId"], "sortIndex": node["sortIndex"],
    "subKey": node["subKey"], "subType": node["subType"],
    "stepParams": node["stepParams"],
}, headers=H)
```

### Chart SQL must be saved separately

```python
# flowModels:save only stores the node structure; SQL requires flowSql:save
requests.post(f"{BASE}/api/flowSql:save", json={
    "uid": chart_uid, "sql": sql_string, "dataSourceKey": "main"
}, headers=H)
```

### Batch scan and fix

```python
import re

# Scan all blocks
r = requests.get(f"{BASE}/api/flowModels:list?paginate=false&pageSize=3000", headers=H)
all_blocks = r.json()["data"]

for d in all_blocks:
    if d.get("use") != "JSBlockModel": continue
    code = d["stepParams"]["jsSettings"]["runJs"]["code"]

    # Check for common issues
    issues = []
    if re.findall(r'\.\w+function\(', code):  issues.append('.mapfunction(')  # mangled by agent
    if '...opts' in code:                      issues.append('spread')
    if 'function((' in code:                   issues.append('double paren')

    if issues:
        print(f"{d['uid']}: {issues}")
```

### Python f-string pitfall

```python
# ❌ f-string escapes JS ${} to \${}
code = f"return `${{value}}`"  # result: return `\${value}`

# ✅ Use r-string or concatenation
code = r"return `${value}`"              # raw string
code = "return `" + "${value}" + "`"     # concatenation
```

---

## Table Summary Row

### Core Pattern

Add a `beforeRender` event flow to the TableBlockModel's `flowRegistry`:

```python
flow_registry[flow_key] = {
    "key": flow_key,
    "title": "Event flow",
    "on": { "eventName": "beforeRender",
            "defaultParams": { "condition": { "items": [], "logic": "$and" } } },
    "steps": {
        step_key: {
            "key": step_key, "use": "runjs", "sort": 1, "flowKey": flow_key,
            "defaultParams": { "code": summary_js_code }
        }
    }
}
```

### $dateBetween Compatibility

The `nb_crm_orders:list` API accepts `$dateBetween: "2026-02"`, but `flowSql:run` requires an array. Summary row code needs a sanitizer:

```js
var _sanitizeFilter = function(f) {
  if (!f || typeof f !== 'object') return f;
  if (Array.isArray(f)) return f.map(function(item) { return _sanitizeFilter(item); });
  var result = {};
  for (var k in f) {
    if (k === '$dateBetween' && typeof f[k] === 'string') {
      var v = f[k];
      if (/^\d{4}-\d{2}$/.test(v)) {
        var parts = v.split('-');
        var lastDay = new Date(Number(parts[0]), Number(parts[1]), 0).getDate();
        result[k] = [v + '-01', v + '-' + String(lastDay).padStart(2, '0')];
      } else { result[k] = v; }
    } else { result[k] = _sanitizeFilter(f[k]); }
  }
  return result;
};

// Usage
var filter = _sanitizeFilter(ctx.resource.getFilter());
```

---

## Page Export (Full Node Tree)

NocoBase has no dedicated export API, but the full page structure can be retrieved through three endpoints:

```python
# 1. Get page Schema
GET /api/uiSchemas:getJsonSchema/{schemaUid}

# 2. Get RootPageModel
GET /api/flowModels:findOne?parentId={schemaUid}&subKey=page

# 3. Get BlockGridModel
GET /api/flowModels:findOne?parentId={tabUid}&subKey=grid
```

**Batch export approach**: pull all flowModels at once and assemble the tree locally:

```python
# Pull everything (one request)
r = requests.get(f"{BASE}/api/flowModels:list?paginate=false&pageSize=5000", headers=H)
all_models = r.json()["data"]

# Index by parentId
by_parent = {}
for m in all_models:
    by_parent.setdefault(m.get("parentId",""), []).append(m)

# Recursively build the tree
def build_tree(uid):
    children = sorted(by_parent.get(uid, []), key=lambda x: x.get("sortIndex", 0))
    return [{
        "uid": ch["uid"], "use": ch["use"],
        "stepParams": ch.get("stepParams", {}),
        "flowRegistry": ch.get("flowRegistry", {}),
        "children": build_tree(ch["uid"])
    } for ch in children]

# Start export from the tabs child
tree = build_tree(tabs_uid)
```

**Popup export**: popups are also flowModel nodes with `use` containing `Popup`:
```python
popups = [m for m in all_models if "Popup" in m.get("use", "")]
for p in popups:
    popup_tree = build_tree(p["uid"])
```

Export files stored at: `300000-projects/300008-nocobase-builder/crm-export/`

---

## Related Documents

- [Programming Pitfalls Guide](/200000-guides/nocobase-js-sandbox/pitfalls/) — Sandbox API allowlist
- [ctx.openView Popups & Parameter Passing](/200000-guides/nocobase-js-sandbox/open-view/) — defineProperties
- [Cross-Block Filter Linking](/200000-guides/nocobase-js-sandbox/cross-block-filter/) — initResource + addFilterGroup
- [openView Popup Content Building](/200000-guides/nocobase-js-sandbox/popup-content-build/) — Popup node tree + flowSql:save
- [JS Block Reference](/300000-projects/300008-nocobase-builder/02-page-building/js-blocks-reference/) — Summary row patterns and more
