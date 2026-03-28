---
title: openView Popup Content Building
description: Complete workflow for pre-creating Chart / JS Block content nodes for ctx.openView popups via API
tags: [nocobase, js-sandbox, popup, openView, chart, flow-engine, api]
type: guide
status: active
updated: "2026-03-26"
---

# openView Popup Content Building

## Overview

Popups opened by `ctx.openView(popupUid, options)` are blank by default. To place Charts, JS Blocks, or other content inside the popup, you need to pre-create the FlowModel node tree via API.

---

## Popup Node Tree Structure

```
PopupActionModel (uid = popupUid)
  └── ChildPageModel (subKey = "page")
      └── ChildPageTabModel (subKey = "tabs")
          └── BlockGridModel (subKey = "grid")
              ├── JSBlockModel (subKey = "items")    ← KPI summary
              ├── ChartBlockModel (subKey = "items")  ← chart
              └── ...more blocks
```

---

## Two Creation Methods

### Method 1: Let openView auto-create + manually add content (recommended)

First, trigger `openView` on the page to let the framework auto-create the `PopupActionModel → ChildPageModel → ChildPageTabModel` three-level structure. Then add content under `ChildPageTabModel` via API.

```
1. Click on page triggers openView → framework auto-creates popup skeleton
2. API query → find the ChildPageTabModel's uid
3. API creates BlockGridModel + Chart/JS blocks
```

### Method 2: Create everything via API

Manually create all nodes. **Key: the format must exactly match what the framework auto-creates**, otherwise the popup will be blank.

---

## API Creation Steps (Method 2 in detail)

### Step 1: Create PopupActionModel

```python
save({
    "uid": popup_uid,           # e.g., "ni91boznxq4-revenue-detail"
    "use": "PopupActionModel",
    "parentId": card_uid,       # uid of the block that triggers openView
    "sortIndex": 0,
    "subKey": popup_uid,        # ⚠️ Must equal the popup_uid itself, NOT "openView"
    "subType": "object",
    "stepParams": {
        "popupSettings": {
            "openView": {"mode": "drawer", "size": "large"}
        }
    }
})
```

> **Pitfall**: `subKey` must be the popup UID itself. If set to `"openView"` or any other value, the popup will render blank.

### Step 2: Create ChildPageModel

```python
save({
    "uid": page_uid,
    "use": "ChildPageModel",
    "parentId": popup_uid,
    "sortIndex": 0,
    "subKey": "page",
    "subType": "object",
    "stepParams": {
        "pageSettings": {
            "general": {
                "displayTitle": False,   # don't show page title inside popup
                "enableTabs": True       # ⚠️ Must be true
            }
        }
    }
})
```

> **Pitfall**: `enableTabs` must be `true` (NocoBase framework default). If missing, tab content won't render.

### Step 3: Create ChildPageTabModel

```python
save({
    "uid": tab_uid,
    "use": "ChildPageTabModel",
    "parentId": page_uid,
    "sortIndex": 0,
    "subKey": "tabs",
    "subType": "object"
})
```

### Step 4: Create BlockGridModel

```python
save({
    "uid": grid_uid,
    "use": "BlockGridModel",
    "parentId": tab_uid,
    "sortIndex": 0,
    "subKey": "grid",
    "subType": "object",
    "stepParams": {
        "gridSettings": {
            "grid": {
                "rows": {
                    row1_key: [[js_uid]],      # row 1: JS summary
                    row2_key: [[chart_uid]],    # row 2: chart
                }
            }
        }
    }
})
```

### Step 5: Create content blocks

**JSBlockModel (KPI summary):**

```python
save({
    "uid": js_uid,
    "use": "JSBlockModel",
    "parentId": grid_uid,
    "sortIndex": 1,
    "subKey": "items",
    "subType": "array",
    "stepParams": {
        "jsSettings": {
            "runJs": {
                "code": "...",      # JS code
                "version": "v1"
            }
        }
    }
})
```

**ChartBlockModel (SQL chart):**

```python
save({
    "uid": chart_uid,
    "use": "ChartBlockModel",
    "parentId": grid_uid,
    "sortIndex": 2,
    "subKey": "items",
    "subType": "array",
    "stepParams": {
        "chartSettings": {
            "configure": {
                "query": {
                    "mode": "sql",
                    "sql": "SELECT ... FROM ..."
                },
                "chart": {
                    "option": {
                        "mode": "custom",
                        "raw": "return { ... }"   # ECharts option JS
                    }
                }
            }
        }
    }
})
```

### Step 6: Save SQL template (required for Charts!)

`flowModels:save` only stores the node structure. SQL charts must additionally call `flowSql:save`, otherwise you get `Cannot read properties of null (reading 'sql')`.

```python
requests.post(f"{BASE}/api/flowSql:save", json={
    "uid": chart_uid,
    "sql": "SELECT ...",
    "dataSourceKey": "main"
})
```

---

## Key Differences: Auto-Created vs Manual

| Property | Auto-created (correct) | Common manual mistake | Consequence |
|----------|----------------------|----------------------|-------------|
| PopupActionModel.subKey | popup UID itself | `"openView"` | Popup renders blank |
| PopupActionModel.stepParams | `{popupSettings: {openView: {mode, size}}}` | `{}` | Popup renders blank |
| ChildPageModel.stepParams | `{pageSettings: {general: {enableTabs: true}}}` | `{}` | Content won't render |
| ChartBlockModel SQL | Must call `flowSql:save` | Only calling `flowModels:save` | Chart errors with null |

---

## Debugging Tips

### Find popup nodes

```python
# List all PopupActionModels
popups = [d for d in all_models if d["use"] == "PopupActionModel"]

# Recursively print popup content tree
def show(uid, depth=0):
    children = [d for d in all_models if d.get("parentId") == uid]
    for ch in sorted(children, key=lambda x: x.get("sortIndex", 0)):
        print(f"{'  '*depth}{ch['use']} uid={ch['uid']} subKey={ch.get('subKey','')}")
        show(ch['uid'], depth+1)
```

### Compare auto-created vs manually created

```python
# Auto-created (reference)
auto = requests.get(f"{BASE}/api/flowModels:get?filterByTk={auto_popup_uid}").json()["data"]
# Manually created (to fix)
manual = requests.get(f"{BASE}/api/flowModels:get?filterByTk={manual_popup_uid}").json()["data"]
# Compare field by field
for key in ["subKey", "subType", "stepParams"]:
    if auto.get(key) != manual.get(key):
        print(f"DIFF {key}: auto={auto.get(key)} vs manual={manual.get(key)}")
```

---

## Complete Example: Revenue Detail Popup

```python
import random, string

def uid():
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=11))

CARD_UID = "ni91boznxq4"
POPUP_UID = CARD_UID + "-revenue-detail"
PAGE_UID = uid()
TAB_UID = uid()
GRID_UID = uid()
JS_UID = uid()
CHART_UID = uid()
ROW1 = uid()
ROW2 = uid()

# 1. PopupActionModel
save({"uid": POPUP_UID, "use": "PopupActionModel", "parentId": CARD_UID,
      "sortIndex": 0, "subKey": POPUP_UID, "subType": "object",
      "stepParams": {"popupSettings": {"openView": {"mode": "drawer", "size": "large"}}}})

# 2. ChildPageModel
save({"uid": PAGE_UID, "use": "ChildPageModel", "parentId": POPUP_UID,
      "sortIndex": 0, "subKey": "page", "subType": "object",
      "stepParams": {"pageSettings": {"general": {"displayTitle": False, "enableTabs": True}}}})

# 3. ChildPageTabModel
save({"uid": TAB_UID, "use": "ChildPageTabModel", "parentId": PAGE_UID,
      "sortIndex": 0, "subKey": "tabs", "subType": "object"})

# 4. BlockGridModel
save({"uid": GRID_UID, "use": "BlockGridModel", "parentId": TAB_UID,
      "sortIndex": 0, "subKey": "grid", "subType": "object",
      "stepParams": {"gridSettings": {"grid": {"rows": {ROW1: [[JS_UID]], ROW2: [[CHART_UID]]}}}}})

# 5. JSBlockModel
save({"uid": JS_UID, "use": "JSBlockModel", "parentId": GRID_UID,
      "sortIndex": 1, "subKey": "items", "subType": "array",
      "stepParams": {"jsSettings": {"runJs": {"code": "ctx.render(<div>KPI Summary</div>);", "version": "v1"}}}})

# 6. ChartBlockModel + flowSql:save
SQL = "SELECT TO_CHAR(order_date,'YYYY-MM') as month, SUM(amount) as rev FROM orders GROUP BY 1 ORDER BY 1"
save({"uid": CHART_UID, "use": "ChartBlockModel", "parentId": GRID_UID,
      "sortIndex": 2, "subKey": "items", "subType": "array",
      "stepParams": {"chartSettings": {"configure": {
          "query": {"mode": "sql", "sql": SQL},
          "chart": {"option": {"mode": "custom", "raw": "return {dataset:{source:ctx.data.objects},...}"}}
      }}}})

# ⚠️ Must save SQL separately
requests.post(f"{BASE}/api/flowSql:save", json={"uid": CHART_UID, "sql": SQL, "dataSourceKey": "main"})
```

---

## Chart Option Writing Notes

### Arrow functions are not available

Chart `option.raw` executes in a restricted context. **Arrow functions may not be supported**, causing the chart to render blank (all gray).

```js
// ❌ Arrow functions — may not work in Chart option
itemStyle: { color: p => colorMap[p.name] || '#999' }
formatter: (p) => p.name + ': ' + p.value

// ✅ Traditional functions — safe
itemStyle: { color: function(p) { return colorMap[p.name] || '#999'; } }
formatter: function(p) { return p.name + ': ' + p.value; }
```

### Use data array instead of dataset + encode

When you need different colors per data point, use `series.data` array + inline `itemStyle` instead of `dataset + encode`:

```js
// ❌ dataset + encode + function-based coloring — prone to issues
dataset: { source: ctx.data.objects },
series: [{ encode: { itemName: 'name', value: 'value' },
  itemStyle: { color: p => colors[p.dataIndex] } }]

// ✅ data array + inline itemStyle — reliable
var pieData = data.map(function(d, i) {
  return { name: d.name, value: Number(d.value),
    itemStyle: { color: colors[i % colors.length] } };
});
series: [{ data: pieData }]
```

### series.data format

When xAxis uses a `data` property to provide categories, series.data must be a **pure numeric array** — do not use `[name, value]` tuples:

```js
// ❌ Wrong — category axis + tuples = won't render
xAxis: { type: 'category', data: months },
series: [{ data: data.map(function(d) { return ['', Number(d.revenue)]; }) }]

// ✅ Correct — pure numeric values, one-to-one with xAxis.data
xAxis: { type: 'category', data: months },
series: [{ data: data.map(function(d) { return Number(d.revenue); }) }]
```

### Chart option style templates

Unified style for easy reuse:

```js
// === Pie chart template ===
var colors = ['#3b82f6','#6366f1','#8b5cf6','#ec4899','#f59e0b','#22c55e','#14b8a6','#06b6d4'];
var pieData = data.map(function(d, i) {
  return { name: d.name, value: Number(d.value || 0),
    itemStyle: { color: colors[i % colors.length] } };
});
return {
  title: { text: 'Title', subtext: 'Subtitle', left: 'center' },
  tooltip: { trigger: 'item',
    formatter: function(p) { return p.name + ': ' + p.value + ' (' + p.percent + '%)'; }
  },
  legend: { bottom: 0, type: 'scroll' },
  series: [{
    type: 'pie', radius: ['35%','65%'], center: ['50%','42%'],
    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
    label: { show: true, formatter: function(p) { return p.name + '\n' + p.percent + '%'; }, fontSize: 10 },
    emphasis: { label: { fontSize: 14, fontWeight: 'bold' },
      itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' } },
    data: pieData
  }]
};

// === Bar + line combo template ===
return {
  title: { text: 'Title', left: 'center' },
  tooltip: { trigger: 'axis' },
  legend: { bottom: 0 },
  grid: { left: '3%', right: '4%', bottom: 50, top: 60, containLabel: true },
  xAxis: { type: 'category', data: data.map(function(d){return d.label}),
    axisLabel: { rotate: 45, fontSize: 10 } },
  yAxis: [
    { type: 'value', name: 'Amount',
      axisLabel: { formatter: function(v) { return v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v; } } },
    { type: 'value', name: 'Count', position: 'right' }
  ],
  series: [
    { name: 'Amount', type: 'bar',
      data: data.map(function(d){ return Number(d.amount); }),
      itemStyle: { color: '#3b82f6', borderRadius: [4,4,0,0] } },
    { name: 'Count', type: 'line', yAxisIndex: 1,
      data: data.map(function(d){ return Number(d.count); }),
      itemStyle: { color: '#f59e0b' }, lineStyle: { width: 2 },
      label: { show: true, position: 'top', fontSize: 9 } }
  ]
};
```

**Rules**:
- Colors: use Tailwind palette consistently: `#3b82f6`(blue) `#22c55e`(green) `#f59e0b`(amber) `#8b5cf6`(violet) `#ec4899`(pink) `#ef4444`(red)
- Bar chart rounded corners: `borderRadius: [4,4,0,0]`
- Donut chart ring: `radius: ['35%','65%']`, white spacing: `borderColor:'#fff', borderWidth:2`
- Title centered: `left: 'center'`, legend at bottom: `bottom: 0`
- Axis labels abbreviate large numbers: `1000 → 1K`
- All functions use `function(){}`, not arrow functions

### SQL Template Variable Passing

Chart SQL can access popup `defineProperties` variables via `{{ ctx.xxx }}`:

```sql
-- Reference defineProperties variables directly in SQL
SELECT * FROM nb_crm_opportunities
WHERE stage = {{ ctx.selectedStage }}
```

Corresponding openView call:

```js
ctx.openView(popupUid, {
  defineProperties: {
    selectedStage: {
      value: 'prospecting',
      meta: { title: 'Stage', type: 'string' },
    },
  },
});
```

The Chart SQL inside the popup will automatically resolve `{{ ctx.selectedStage }}` to `'prospecting'`.

---

## Related Documents

- [ctx.openView Popups & Parameter Passing](/200000-guides/nocobase-js-sandbox/open-view/) — openView function signature and defineProperties
- [Popup Context](/200000-guides/nocobase-js-sandbox/popup-context/) — Accessing records inside popups
- [Cross-Block Filter Linking](/200000-guides/nocobase-js-sandbox/cross-block-filter/) — initResource + addFilterGroup
- [Dashboard Build Guide](/200000-guides/nocobase-dashboard-build/) — Charts + filters + KPI full build guide
