---
title: "JS Block Reference Manual"
description: "NocoBase JS block/column ctx API, common patterns, and code templates"
tags: [nocobase, javascript, js-block, reference]
sidebar:
  label: JS Block Reference
  order: 5
---

# JS Block Reference Manual

NocoBase JS blocks (JSBlockModel / JSColumnModel / JSItemModel) run inside a SES Compartment sandbox, providing rendering and data access capabilities through the `ctx` object. This manual covers the complete ctx API reference, categorized common patterns, all real-world code from the AM system, and development notes.

## Complete ctx API Reference

### Rendering & Components

| API | Description | Example |
|-----|-------------|---------|
| `ctx.render(element)` | Render a React component into the block container | `ctx.render(h('div', null, 'Hello'))` |
| `ctx.React` | React module (includes useState, useEffect, and other Hooks) | `const [v, setV] = ctx.React.useState(0)` |
| `ctx.antd` | All Ant Design components | `ctx.antd.Tag`, `ctx.antd.Badge`, `ctx.antd.Statistic` |
| `ctx.antd.theme` | Ant Design theme utilities | `ctx.antd.theme.darkAlgorithm` |

### Data Access

| API | Description | Available Context |
|-----|-------------|-------------------|
| `ctx.record` | Current row data (read-only object) | JSColumnModel, JSItemModel, JSFieldModel |
| `ctx.value` | Current field value | JSColumnModel, JSFieldModel |
| `ctx.form` | Form instance | FormJSFieldItemRunJSContext |
| `ctx.formValues` | Current form values | FormJSFieldItemRunJSContext |

### HTTP Requests

| API | Description |
|-----|-------------|
| `ctx.api.request({url, params, method, data})` | NocoBase API request (token included automatically) |
| `ctx.resource(name)` | Get a Collection Resource object |

```js
// Example: query a list
const r = await ctx.api.request({
  url: 'nb_am_assets:list',
  params: { paginate: false, filter: { status: 'in_use' } }
});
const items = r?.data?.data || [];
```

### Messages & Notifications

| API | Description |
|-----|-------------|
| `ctx.message.success(text)` | Success message |
| `ctx.message.error(text)` | Error message |
| `ctx.modal.confirm({title, content, onOk})` | Confirmation dialog |
| `ctx.notification.open({message, description})` | Notification |

### Theme & Styling

| API | Description |
|-----|-------------|
| `ctx.themeToken` | Ant Design Design Token (observable, auto-updates on theme switch) |
| `ctx.antdConfig` | ConfigProvider context (includes `theme.algorithm`) |
| `ctx.themeToken.colorPrimary` | Primary color |
| `ctx.themeToken.colorBgBase` | Background color (light: `#ffffff`, dark: `#000000`) |
| `ctx.themeToken.colorText` | Text color |
| `ctx.themeToken.borderRadiusLG` | Large border radius |

### Utility Libraries

| API | Description |
|-----|-------------|
| `ctx.dayjs` | dayjs date library |
| `ctx.t(key)` | i18n translation |

### Global Objects in the Sandbox

| Object | Availability |
|--------|-------------|
| `Date.now()` / `new Date()` | Fully available (lockdown not enabled) |
| `Math.*` | Fully available |
| `setTimeout` / `clearTimeout` | Whitelisted, available |
| `setInterval` / `clearInterval` | Whitelisted, available |
| `console` | Available |
| `window.*` | Only real `window` in JSBlockModel / JSFieldModel |
| `requestAnimationFrame` | Requires `window.` prefix or use `setTimeout(fn, 16)` as alternative |
| `fetch` | Use `ctx.api.request()` instead |

---

## JS Column Recommendations

JS Columns (JSColumnModel) can aggregate multiple fields, perform dynamic calculations, and apply conditional rendering, supplementing displays that plain fields cannot achieve. Good use of JS Columns can significantly increase table information density.

Common use cases: multi-field composites (name + ID in one column), status/type tags, amounts/progress/countdowns, association counts (async API), conditional coloring.

During page building, plan with `outline(kind="column")`, and leave implementation to a dedicated JS agent.

---

## Common Pattern Categories

### Pattern 1: Status Tags

The most common JS column pattern -- renders an enum field as a colored tag.

```js
const r = ctx.record || {};
const colors = {'in_use':'green', 'borrowed':'blue', 'under_repair':'orange', 'disposed':'red', 'in_stock':'default'};
ctx.render(ctx.React.createElement(ctx.antd.Tag, {color: colors[r.status]||'default'}, r.status||'-'));
```

**Generic template function** (Python side):

```python
def status_tag(field, mapping, default='default'):
    pairs = ", ".join(f"'{k}':'{v}'" for k, v in mapping.items())
    return f"""const r = ctx.record || {{}};
const s = r.{field} || '';
const m = {{{pairs}}};
ctx.render(ctx.React.createElement(ctx.antd.Tag, {{color: m[s]||'{default}'}}, s||'-'));"""
```

### Pattern 2: Approval Status (Badge)

Uses Ant Design Badge to display approval workflow status; more suitable for multi-step approvals than Tag.

```js
const s = (ctx.record||{}).status || '';
const m = {
  'draft':'default', 'dept_review':'processing', 'admin_review':'processing',
  'mgr_review':'warning', 'approved':'success', 'rejected':'error',
  'purchasing':'processing', 'completed':'success'
};
ctx.render(ctx.React.createElement(ctx.antd.Badge, {status: m[s]||'default', text: s||'-'}));
```

Badge status values: `default`, `processing` (blue pulse), `success`, `warning`, `error`.

### Pattern 3: Currency Formatting

Renders a number with a currency symbol, highlighting large amounts in red.

```js
const r = ctx.record || {};
const v = r.purchase_price;
const text = v != null
  ? '\u00A5' + Number(v).toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2})
  : '-';
const color = v > 10000 ? ctx.themeToken?.colorWarning || '#faad14' : ctx.themeToken?.colorText || '#000';
ctx.render(ctx.React.createElement('span', {style: {fontWeight: 500, color}}, text));
```

### Pattern 4: Date Countdown

Used for scenarios like insurance expiry, annual inspection due dates, maintenance due dates, etc.

```js
const r = ctx.record || {};
const d = r.next_maint_date;
if (!d) { ctx.render(ctx.React.createElement('span', {style: {color: '#999'}}, '-')); return; }
const diff = Math.ceil((new Date(d) - new Date()) / 86400000);
let color = '#52c41a', text = diff + ' days';
if (diff < 0) { color = '#ff4d4f'; text = 'Expired ' + Math.abs(diff) + ' days'; }
else if (diff <= 30) { color = '#faad14'; text = diff + ' days'; }
ctx.render(ctx.React.createElement(ctx.antd.Tag, {color}, 'Maint: ' + text));
```

### Pattern 5: Inventory Status

Displays color-coded status by comparing current stock against safety stock.

```js
const r = ctx.record || {};
const cur = r.current_stock || 0, safe = r.safe_stock || 0;
let color = 'green', text = 'Normal';
if (cur === 0) { color = 'red'; text = 'Out of Stock'; }
else if (cur < safe) { color = 'orange'; text = 'Low'; }
ctx.render(ctx.React.createElement(ctx.antd.Tag, {color}, text));
```

### Pattern 6: KPI Statistic Cards

Queries the API for data counts and displays them as Statistic components.

```js
(async () => {
  try {
    const r = await ctx.api.request({
      url: 'nb_am_assets:list',
      params: { paginate: false, filter: { status: 'in_use' } }
    });
    const count = Array.isArray(r?.data?.data) ? r.data.data.length
                : Array.isArray(r?.data) ? r.data.length : 0;
    ctx.render(ctx.React.createElement(ctx.antd.Statistic, {
      title: 'Active Assets', value: count,
      valueStyle: { fontSize: 28, color: '#52c41a' }
    }));
  } catch(e) {
    ctx.render(ctx.React.createElement(ctx.antd.Statistic, {
      title: 'Active Assets', value: '?', valueStyle: { fontSize: 28 }
    }));
  }
})();
```

### Pattern 7: Dark Mode Detection

```js
const algorithm = ctx.antdConfig?.theme?.algorithm;
const darkAlgo = ctx.antd.theme.darkAlgorithm;
const isDark = Array.isArray(algorithm)
  ? algorithm.some(fn => fn === darkAlgo)
  : algorithm === darkAlgo;
// Use isDark to toggle styles
```

### Pattern 8: Detail Card (Async Data + Depreciation Calculation)

Suitable for asset detail popups, displaying depreciation progress and useful life.

```js
(async () => {
  const h = ctx.React.createElement;
  const { Card, Progress, Tag, Statistic, Space, Typography } = ctx.antd;
  const r = ctx.record || {};

  // Depreciation calculation
  const purchaseDate = r.purchase_date ? new Date(r.purchase_date) : null;
  const usefulYears = r.useful_years || 5;
  const purchasePrice = r.purchase_price || 0;
  const salvageValue = r.salvage_value || 0;
  const now = new Date();

  let yearsUsed = 0, depreciation = 0, netValue = purchasePrice, progress = 0;
  if (purchaseDate) {
    yearsUsed = Math.max(0, (now - purchaseDate) / (365.25 * 86400000));
    const annualDep = usefulYears > 0 ? (purchasePrice - salvageValue) / usefulYears : 0;
    depreciation = Math.min(annualDep * yearsUsed, purchasePrice - salvageValue);
    netValue = Math.max(purchasePrice - depreciation, salvageValue);
    progress = usefulYears > 0 ? Math.min(100, (yearsUsed / usefulYears) * 100) : 0;
  }

  const statusColors = {'in_use':'green','borrowed':'blue','under_repair':'orange','disposed':'red','in_stock':'default'};
  const remainYears = Math.max(0, usefulYears - yearsUsed);
  const fmt = (v) => v != null ? '\u00A5' + Number(v).toLocaleString('zh-CN', {minimumFractionDigits: 2}) : '-';

  ctx.render(
    h('div', {style: {padding: 0}},
      h(Space, {style: {marginBottom: 12}},
        h(Tag, {color: statusColors[r.status]||'default', style: {fontSize: 14, padding: '2px 12px'}}, r.status || '-'),
        h(Typography.Text, {type: 'secondary'}, r.asset_code || '')
      ),
      h(Card, {size: 'small', title: 'Depreciation', style: {marginBottom: 12}},
        h(Progress, {
          percent: Math.round(progress),
          strokeColor: progress > 80 ? '#ff4d4f' : progress > 50 ? '#faad14' : '#52c41a',
          format: (p) => p + '%'
        }),
        h('div', {style: {display: 'flex', justifyContent: 'space-between', marginTop: 8}},
          h(Statistic, {title: 'Original Value', value: fmt(purchasePrice), valueStyle: {fontSize: 16}}),
          h(Statistic, {title: 'Accum. Depreciation', value: fmt(depreciation), valueStyle: {fontSize: 16, color: '#ff4d4f'}}),
          h(Statistic, {title: 'Net Value', value: fmt(netValue), valueStyle: {fontSize: 16, color: '#52c41a'}})
        )
      ),
      h(Card, {size: 'small', title: 'Service Life'},
        h('div', {style: {display: 'flex', justifyContent: 'space-between'}},
          h(Statistic, {title: 'Useful Life', value: usefulYears, suffix: 'yrs', valueStyle: {fontSize: 16}}),
          h(Statistic, {title: 'Used', value: yearsUsed.toFixed(1), suffix: 'yrs', valueStyle: {fontSize: 16}}),
          h(Statistic, {title: 'Remaining', value: remainYears.toFixed(1), suffix: 'yrs',
            valueStyle: {fontSize: 16, color: remainYears < 1 ? '#ff4d4f' : remainYears < 2 ? '#faad14' : '#52c41a'}
          })
        )
      )
    )
  );
})();
```

### Pattern 9: Table Summary Row (Table Summary)

Renders a fixed summary row at the bottom of a table block, with support for filter-linked data and selection-based totals. **Unlike Patterns 1-8**, this pattern runs in the **Before render / Before all flows** context (supports JSX), and assigns output via `ctx.model.props.summary`.

#### Context Differences

| Feature | JSColumnModel (Patterns 1-8) | Before render (Pattern 9) |
|---------|------------------------------|---------------------------|
| JSX | Not supported, requires `createElement` | Supported |
| Component library | `ctx.antd` | `ctx.libs.antd` |
| React | `ctx.React` | `ctx.libs.React` |
| lodash | Not available | `ctx.libs.lodash` |
| SQL | Not available | `ctx.sql.run(sql, {filter})` |
| Resource | `ctx.resource(name)` | `ctx.resource` (current table) |
| Output method | `ctx.render(element)` | `ctx.model.props.summary = () => <Comp />` |

#### Core Template: Selection Summary + Total Summary

```jsx
// Before render, Before all flows
const { Table, Tag, Typography, Tooltip } = ctx.libs.antd;
const _ = ctx.libs.lodash;
const { useState, useEffect, useCallback, useRef } = ctx.libs.React;

const fmt = (v) => Number(v || 0).toLocaleString('zh-CN',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Summary = () => {
  const [allData, setAllData] = useState([]);
  const [selectedRows, setSelectedRows] = useState([]);
  const patchedRef = useRef(false);

  // ---- Full dataset (follows filter changes) ----
  const fetchAll = useCallback(async () => {
    try {
      const filter = ctx.resource.getFilter();
      const items = await ctx.sql.run(
        'SELECT "id","amount","probability" FROM "my_table"',
        { filter }
      );
      setAllData(items || []);
    } catch (e) { ctx.logger?.error('Summary fetch failed', e); }
  }, []);

  // ---- Selected rows listener (monkey-patch) ----
  useEffect(() => {
    fetchAll();
    ctx.resource.on('refresh', fetchAll);

    // Initialize
    setSelectedRows(ctx.resource?.getSelectedRows?.() || []);

    // Intercept setSelectedRows for real-time updates
    if (!patchedRef.current && ctx.resource?.setSelectedRows) {
      const orig = ctx.resource.setSelectedRows.bind(ctx.resource);
      ctx.resource.setSelectedRows = (rows) => {
        const r = orig(rows);
        setSelectedRows([...rows]);
        return r;
      };
      patchedRef.current = true;
    }

    return () => ctx.resource.off('refresh', fetchAll);
  }, []);

  const selTotal = _.sumBy(selectedRows, r => Number(r.amount) || 0);
  const allTotal = _.sumBy(allData, r => Number(r.amount) || 0);

  return (
    <Table.Summary fixed>
      {/* Selection summary */}
      <Table.Summary.Row style={{
        background: selectedRows.length > 0 ? '#e6f7ff' : '#fafafa'
      }}>
        <Table.Summary.Cell index={0} colSpan={2}>
          <Typography.Text strong style={{ color: '#1890ff' }}>
            {selectedRows.length > 0
              ? `✓ ${selectedRows.length} selected`
              : '✓ None selected'}
          </Typography.Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={2}>
          <Tooltip title="Selected amount">
            <Typography.Text strong>{fmt(selTotal)}</Typography.Text>
          </Tooltip>
        </Table.Summary.Cell>
        {/* ...more columns */}
      </Table.Summary.Row>

      {/* Total summary */}
      <Table.Summary.Row style={{ background: '#fafafa' }}>
        <Table.Summary.Cell index={0} colSpan={2}>
          <Typography.Text strong>
            Total {allData.length} records
          </Typography.Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={2}>
          <Typography.Text strong>{fmt(allTotal)}</Typography.Text>
        </Table.Summary.Cell>
        {/* ...more columns */}
      </Table.Summary.Row>
    </Table.Summary>
  );
};

ctx.model.props.summary = () => <Summary />;
```

#### Key Technical Details

**1. Filter Synchronization**

`ctx.resource.getFilter()` retrieves the current filter conditions and passes them to the `filter` parameter of `ctx.sql.run()`. The SQL layer automatically appends a WHERE clause. Listening to the `refresh` event triggers a re-fetch when filters change.

**2. Real-time Selected Row Access**

In NocoBase v2, when table rows are checked, `model.resource.setSelectedRows(rows)` writes to metadata but **does not fire an event**. Real-time listening is achieved through monkey-patching:

```javascript
const orig = ctx.resource.setSelectedRows.bind(ctx.resource);
ctx.resource.setSelectedRows = (rows) => {
  const r = orig(rows);          // Call original method to preserve default behavior
  setSelectedRows([...rows]);    // Update React state
  return r;
};
```

- `getSelectedRows()` returns an array of full row objects (not just IDs)
- Use `patchedRef` to ensure patching only happens once

**3. Cell Index Alignment with Table Columns**

The `index` of `Table.Summary.Cell` must match the table column order. Use `colSpan` to merge cells.

**4. ctx.sql.run Limitations**

Does not support using `filter` directly with SQL aggregation (e.g., `SELECT SUM(amount)`). You must query rows first, then aggregate on the frontend:

```javascript
// Correct: frontend aggregation
const items = await ctx.sql.run('SELECT "amount" FROM "table"', { filter });
const total = _.sumBy(items, 'amount');

// Not supported: SQL aggregation + filter
// await ctx.sql.run('SELECT SUM("amount") FROM "table"', { filter });
```

#### Complete Example Set

5 progressively complex implementations are available in (internal reference files):

| File | Features |
|------|----------|
| `0_basic.js` | Minimal: selected + total amount sum |
| `1_stage_group.js` | Selected/total + stage distribution Tags |
| `2_pipeline.js` | Selected + stage breakdown + Progress bar |
| `3_lead_source.js` | Selected/total + source grouping + stage distribution Tags |
| `4_dual_dimension.js` | Selected/total + stage/source Switch toggle |

---

### Pattern 10: Chart Placeholder (formerly Pattern 9)

A unified chart placeholder style, to be replaced with real charts later.

```js
ctx.render(ctx.React.createElement('div', {
  style: { padding: 32, textAlign: 'center', background: 'linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%)',
    borderRadius: 8, minHeight: 200, display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexDirection: 'column' }
}, [
  ctx.React.createElement('div', {key:'i', style:{fontSize:48, marginBottom:12}}, '📊'),
  ctx.React.createElement('div', {key:'t', style:{fontSize:16, fontWeight:500, color:'#333'}}, 'Chart Title'),
  ctx.React.createElement('div', {key:'d', style:{fontSize:12, marginTop:6, color:'#999'}}, 'Chart description'),
]));
```

---

## AM System JS Block Inventory

### Table JS Columns

| Page | Column Name | Pattern | Field | Color Mapping |
|------|-------------|---------|-------|---------------|
| Asset Ledger | Status | Tag | `status` | In Use=green, On Loan=blue, Under Repair=orange, Scrapped=red, In Stock=default |
| Purchase Requests | Approval | Badge | `status` | Draft=default, Pending Dept/Admin Approval=processing, Pending Leadership Approval=warning, Approved/Completed=success, Rejected=error |
| Transfer & Loan | Type | Tag | `transfer_type` | Transfer=blue, Loan=orange, Return=green |
| Transfer & Loan | Status | Tag | `status` | Pending Approval=orange, Pending Dispatch=processing, Dispatched=blue, Returned=green, Rejected=red |
| Repair Management | Status | Badge | `status` | Pending Acceptance=warning, Under Repair=processing, Completed=success |
| Repair Management | Repair Cost | Currency | `repair_cost` | >10000 shows warning color |
| Disposal Management | Approval Status | Badge | `status` | Multi-step approval flow (6 statuses) |
| Disposal Management | Book Value | Currency | `book_value` | >10000 shows warning color |
| Item Catalog | Inventory Status | Stock Comparison | `current_stock` vs `safe_stock` | Normal=green, Low=orange, Out of Stock=red |
| Requisition | Approval Status | Badge | `status` | Pending Approval=warning, Pending Dispatch=processing, Dispatched=success |
| Requisition | Amount | Currency | `total_amount` | >10000 shows warning color |
| Inventory Management | Type Label | Tag | `record_type` | Inbound=green, Outbound=blue, Surplus=cyan, Shortage=red |
| Inventory Management | Unit Price | Currency | `unit_price` | Standard format |
| Vehicle Records | Status Label | Tag | `status` | Available=green, In Use=blue, Under Repair=orange, Scrapped=red |
| Vehicle Requests | Approval Status | Badge | `status` | Pending Approval=warning, Pending Assignment=processing, Assigned=success |
| Trip Records | Trip Status | Tag | `status` | In Progress=blue, Completed=green |
| Maintenance & Repair | Status | Badge | `status` | Pending Approval=warning, Under Repair=processing, Completed=success |
| Maintenance & Repair | Total Cost | Currency | `total_cost` | >10000 shows warning color |
| Maintenance & Repair | Next Maintenance | Countdown | `next_maint_date` | <0=red (overdue), <30=yellow, else=green |
| Cost Statistics | Amount | Currency | `amount` | Standard format |
| Cost Statistics | Cost Type | Tag | `cost_type` | Fuel=blue, Maintenance=green, Repair=orange, Violation=red, etc. |

### Detail Popup Sub-table JS Columns

| Sub-table | Column Name | Pattern | Location |
|-----------|-------------|---------|----------|
| Transfer Records | Status | Tag | Asset Ledger Detail |
| Repair Records | Status | Badge | Asset Ledger Detail |
| Disposal Records | Status | Badge | Asset Ledger Detail |

### Detail Card JS Blocks

| Block | Location | Function |
|-------|----------|----------|
| Asset Card | Asset Ledger Detail Popup | Depreciation progress ring + Original Value/Accumulated Depreciation/Net Value + Useful Life countdown |

### KPI Statistic Cards

Each list page has 3-4 KPI cards (JSBlockModel) at the top that query the corresponding Collection's data counts. Approximately 50+ KPI blocks across 16 pages.

### Chart Placeholders

10 chart placeholder blocks in total (to be replaced with real charts later):
- Asset category distribution, Asset value trend
- Vehicle type distribution
- Department requisition ranking, Item requisition ranking, Monthly requisition trend
- Vehicle total cost trend, Cost type distribution, Per-vehicle cost ranking, Cost per kilometer

---

## Development Notes

### 1. Use createElement Only, Not JSX

The sandbox does not support JSX compilation; you must manually call `ctx.React.createElement`.

```js
// Correct
ctx.render(ctx.React.createElement(ctx.antd.Tag, {color: 'green'}, 'in_use'));

// Wrong (sandbox cannot compile JSX)
// ctx.render(<Tag color="green">In Use</Tag>);
```

Tip: alias `ctx.React.createElement` to `h`:

```js
const h = ctx.React.createElement;
h('div', null, h(ctx.antd.Tag, {color: 'green'}, 'in_use'));
```

### 2. Dark Mode Compatibility

Do not hard-code color values. Use `ctx.themeToken` or Ant Design's built-in semantic colors:

```js
// Good: semantic colors, auto-adapts to dark mode
{ color: ctx.themeToken?.colorText }
{ background: ctx.themeToken?.colorBgContainer }

// Good: Ant Design Tag built-in color names, auto-adapts
h(ctx.antd.Tag, {color: 'green'}, 'in_use')

// Bad: hard-coded colors, may be unreadable in dark mode
{ color: '#333333' }
```

### 3. Use IIFE for Async Code

```js
(async () => {
  const r = await ctx.api.request({url: 'my_coll:list'});
  ctx.render(/* ... */);
})();
```

### 4. Handle Empty Data

`ctx.record` may be `undefined`; always add null guards:

```js
const r = ctx.record || {};
const v = r.status || '-';
```

### 5. Each JS Block Runs Independently

Sandboxes cannot share variables or references. Each JS Block/Column/Item is self-contained.

### 6. flowModels:save Uses Flat Format

When creating JS blocks via API, place `stepParams` at the top level:

```python
nb.save("JSBlockModel", parent, "items", "array", {
    "jsSettings": {"runJs": {"version": "v1", "code": "..."}},
    "cardSettings": {"titleDescription": {"title": "Title"}}
})
```

### 7. flowModels:update Is Full Replacement

When updating existing block code, you must first GET the complete options, merge your changes, then PUT. Use the `nb.update(uid, patch)` method from `nb_page_builder.py` for safe merging.

---

## Toolchain

| Tool | Purpose | Path |
|------|---------|------|
| `nb_page_builder.py` | Create JS blocks/columns | `scripts/nocobase/nb_page_builder.py` |
| `nb-am-js-blocks.py` | Batch create AM system JS blocks | `scripts/nocobase/nb-am-js-blocks.py` |
| `nb_page_tool.py` | Page structure viewing/auditing | `scripts/nocobase/nb_page_tool.py` |
| `js_block_sync.py` | Local file <-> DB code sync | See [Code Sync Workflow](/200000-guides/nocobase-js-sandbox/block-sync/) |

### Builder API Quick Reference

```python
from nb_page_builder import NB
nb = NB()

# Standalone JS block
uid = nb.js_block(parent_grid, "Title", "ctx.render(...)", sort=0)

# Table JS column
uid = nb.js_column(table_uid, "Column Name", "ctx.render(...)", sort=90, width=100)

# Form/Detail JS item
uid = nb.js_item(form_grid, "Title", "ctx.render(...)")

# KPI statistic card
uid = nb.kpi(grid, "Total", "my_coll", filter_={"status": "active"}, color="#52c41a")

# Batch KPIs
uids = nb.kpi_row(grid, "my_coll",
    ("Total",),
    ("Active", {"status": "active"}, "#1890ff"),
    ("Completed", {"status": "done"}, "#52c41a"))

# Chart placeholder
uid = nb.chart_placeholder(grid, "Title", "Description", icon="📊")

# Update existing block code
nb.update(uid, {"stepParams": {"jsSettings": {"runJs": {"version": "v1", "code": "..."}}}})
```

---

## Related Documents

- [JS Sandbox Programming Guide](/200000-guides/nocobase-js-sandbox/) -- Source code investigation, pitfall guide, theme adaptation
- [JS Sandbox Programming Pitfalls](/200000-guides/nocobase-js-sandbox/pitfalls/) -- Common pitfalls and solutions
- [JS Block Theme Detection](/200000-guides/nocobase-js-sandbox/theme-detection/) -- Dark mode detection
- [Code Sync Workflow](/200000-guides/nocobase-js-sandbox/block-sync/) -- UID mapping, file sync
- [Page Building Usage Guide](/300000-projects/300008-nocobase-builder/02-page-building/usage/) -- Full nb_page_builder API
- [AM System Design Document](/300000-projects/300008-nocobase-builder/06-asset-demo/design/) -- Data model for 23 tables
- [Automation Overview](/300000-projects/300008-nocobase-builder/automation-overview/) -- Builder Toolkit architecture
