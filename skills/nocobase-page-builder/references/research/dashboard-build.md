---
title: "NocoBase Dashboard Page Building Guide"
description: "Building complete Dashboards via API on NocoBase 2.0 FlowModel -- filters + charts + KPIs + event flows"
tags: [nocobase, dashboard, flowmodel, chart, api, guide]
sidebar:
  label: "Dashboard Building"
---

## Background

In NocoBase 2.0 (FlowModel architecture), batch-create Dashboard pages via API: including filter blocks, SQL charts (ECharts), KPI cards (JS Block), chart-filter synchronization, and chart click events.

## Key Discovery: Two-Step Storage for SQL Charts

**This is the most important lesson: SQL-mode charts require two steps to work properly.**

### Step 1: flowModels:save -- Create the Node

```python
requests.post(f"{BASE}/api/flowModels:save", json={
    "uid": chart_uid,
    "use": "ChartBlockModel",
    "parentId": grid_uid,
    "sortIndex": 2,
    "subKey": "items",
    "subType": "array",
    "stepParams": {
        "chartSettings": {
            "configure": {
                "query": {"mode": "sql", "sql": sql_template},
                "chart": {
                    "option": {"mode": "custom", "raw": echarts_option_js},
                    "events": {"mode": "custom", "raw": click_event_js}
                }
            }
        }
    }
})
```

### Step 2: flowSql:save -- Store the SQL Template (Required!)

```python
requests.post(f"{BASE}/api/flowSql:save", json={
    "uid": chart_uid,  # Must match the flowModel's uid
    "sql": sql_template,
    "dataSourceKey": "main"
})
```

**If only Step 1 is done, the chart node exists but will not automatically execute SQL during initialization** -- because `ChartBlockModel.onInit()` calls `SQLResource.refresh()` -> `runById(uid)` -> `flowSql:runById`, which looks up the pre-stored SQL by uid to execute it.

### Rationale (Source Code Analysis)

```
ChartBlockModel.onInit()
  -> applyQuery(query)          // Set SQL mode
  -> resource.refresh()          // Initial data load
    -> SQLResource.refresh()
      -> debug=false -> runById()
        -> flowSql:runById {uid}  // Requires SQL pre-stored by flowSql:save
```

When clicking the "Run/Save" button in the UI:
```
beforeParamsSave(ctx, params)
  -> ctx.sql.save({uid, sql, dataSourceKey})  // Automatically calls flowSql:save
```

So when operating manually through the UI you don't need to worry about this step, but when batch-creating via API you must call it explicitly.

## Complete Dashboard Page Structure

```
BlockGridModel (page grid)
├── FilterFormBlockModel         <- Filter block
│   └── FilterFormGridModel
│       ├── FilterFormCustomFieldModel (DateTimeFilterFieldModel, isRange)
│       ├── FilterFormCustomFieldModel (SelectFieldModel, multiple)
│       ├── FilterFormItemModel (m2o -> owner)
│       │   └── RecordSelectFieldModel
│       └── JSItemModel (Filter/Reset buttons)
├── ChartBlockModel x 5         <- SQL charts
│   (each requires flowSql:save)
└── JSBlockModel                <- KPI cards
    (uses ctx.sql.runById to query data)
```

### Grid Layout

```python
"gridSettings": {
    "grid": {
        "rows": {
            "row1": [[FILTER_UID, KPI_UID]],      # One row, two columns
            "row2": [[CHART1_UID], [CHART2_UID]],  # One row, two columns
            "row3": [[CHART3_UID]],                 # One row, one column (full width)
            "row4": [[CHART4_UID], [CHART5_UID]]   # One row, two columns
        },
        "sizes": {
            "row2": [15, 9],    # Ant Design 24-column grid
            "row4": [14, 10]
        }
    }
}
```

## Filter Synchronization Mechanism

Chart SQL references filter form values through Liquid template syntax:

```sql
-- Date range
{% if ctx.var_form1.date_range.length %}
    AND "createdAt" >= {{ ctx.var_form1.date_range[0] }}::timestamp
    AND "createdAt" < {{ ctx.var_form1.date_range[1] }}::timestamp + INTERVAL '1 day'
{% endif %}

-- Owner relation field (note the UID suffix)
{% if ctx.var_form1.owner_<OWNER_FIELD_UID>.id %}
    AND owner_id = {{ ctx.var_form1.owner_<OWNER_FIELD_UID>.id }}
{% endif %}

-- Multiple select dropdown
{% if ctx.var_form1.status_filter.length > 0 %}
    AND status = ANY({{ ctx.var_form1.status_filter }})
{% endif %}
```

`ctx.var_form1` automatically binds to the first FilterFormBlockModel on the page.

### JS Button to Refresh Charts

```javascript
const chartModelIds = ['uid1', 'uid2', ...];
for (const chartId of chartModelIds) {
    const chartResource = ctx.engine.getModel(chartId, true)?.resource;
    if (chartResource) await chartResource.refresh();
}
```

## Chart Click Events

```javascript
chart.off('click');
chart.on('click', 'series', function(params) {
    // Navigate to another page
    ctx.router.navigate('/admin/page-uid');

    // Or open a popup (openView)
    ctx.openView('popup-uid', { defineProperties: {...} });
});
```

## KPI Card ctx.sql Issue

`ctx.sql` may be null in JSBlockModel. Solutions:

1. **KPI SQL templates need to be pre-stored via `flowSql:save`** (same as charts)
2. The `ctx.sql.save()` portion in JS code needs `if (ctx.flowSettingsEnabled)` guard
3. For queries, use `ctx.sql.runById(uid, {bind, type, dataSourceKey})`

If `ctx.sql` is completely unavailable, the fallback is to call the API directly via `ctx.request`:
```javascript
const result = await ctx.request({
    url: 'flowSql:runById',
    method: 'POST',
    data: { uid: 'kpi_uid', type: 'selectRows', dataSourceKey: 'main', bind: {...} }
});
```

## Cross-Instance Migration Notes

| Source (14002) | Target (14202) | Type |
|---|---|---|
| `lead` | `nb_crm_leads` | Table name |
| `opportunity` | `nb_crm_opportunities` | Table name |
| `account` | `nb_crm_customers` | Table name |
| `"order"` | `nb_crm_orders` | Table name |
| `total_amount` | `order_amount` | Field name (orders) |
| `account_id` | `customer_id` | Foreign key (orders) |
| `probability` | `win_probability` | Field name (opportunities) |
| `Win/Lose` | `won/lost` | Enum values (stages) |
| `Paid` | `completed` | Enum values (order status) |

## Example Script

The complete build script is at `/tmp/build-dashboard.py`, containing:
- Filter form (date/status/owner)
- 5 SQL charts (ECharts)
- KPI JS cards
- Grid layout
- flowSql:save calls

## Related Documents

- [NocoBase JS Sandbox](/200000-guides/nocobase-js-sandbox/)
- [NocoBase Tutorial -- Dashboard](/200000-guides/nocobase-2-tutorial/07-dashboard/)
- [NocoBase Builder Project](/300000-projects/300008-nocobase-builder/experiments/hrm-user-test-r19/)
