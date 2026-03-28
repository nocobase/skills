# JS Templates Index

## Rendering API

All JS blocks run in a sandbox with these globals:

| Global | Description |
|--------|-------------|
| `ctx.api.request({url, params})` | NocoBase REST API. `url` = `"collection:list"`, `params` = `{paginate:false, filter:{...}, sort:["-field"], appends:["relation"]}` |
| `ctx.React.createElement(type, props, ...children)` | React 19. Alias as `const h = ctx.React.createElement` |
| `ctx.antd` | **Full Ant Design 5.x** — see component list below |
| `ctx.render(element)` | Output to the block container |
| `ctx.record` | Current row data (available in **columns** and **detail items** only, NOT in page blocks) |

**⚠️ NOT available** (will be rejected by tool validation):
- `ctx.charts`, `ctx.echarts`, `ctx.g2`, `ctx.dataSource` — NO chart library, NO dataSource API
- `useState`, `useEffect`, `useCallback` — NO React hooks (blocks run in eval, not component lifecycle)
- Use `ctx.api.request({url, params})` for data, async IIFE `(async()=>{...})()` for async code
- Use `ctx.antd.Progress` for bar charts, SVG/div for custom visuals

## Phase 2 Workflow

After `nb_auto_js("PREFIX")`, columns are auto-filled. Blocks/items/events are `[todo]` stubs.
Implement each `[todo]`:

```
1. Read the stub description — it tells you WHAT to show
2. Choose a visualization that fits the data + context
3. Write the JS code — fetch data, compute, render with antd
4. nb_inject_js(uid, code)
5. nb_inject_js_dir("js/")  — or inject all at once
```

## Column Templates — `nb_inject_js(uid, code)`

Render custom content per table row. `ctx.record` available.

**Rules:**
- Do NOT use JS columns for select/enum fields (grade/status/type/priority) — NocoBase renders colored tags natively
- DO use JS columns to make tables look **rich and informative**, matching the HTML prototype column designs

### ★ col-composite.js — THE primary column template (use on every main entity)

Every business entity's **primary name/title column** should be composite: bold blue title + gray subtitle info.

| Business entity | TITLE field | SUBS fields | Width |
|----------------|-------------|-------------|-------|
| Customer | `name` | `"city","source"` | 200 |
| Opportunity | `title` | `"customer_id"` (or use createdAt) | 200 |
| Contract | `title` | `"start_date","end_date"` | 200 |
| Lead | `contact_name` | `"company","position"` | 180 |
| Ticket | `subject` | `"description"` | 220 |
| Employee | `name` | `"department_id","position"` | 180 |
| Product | `name` | `"category","spec"` | 200 |

Placeholders: `{TITLE}` = main field name, `{SUBS}` = JS string: `"field1","field2"` (supports 1-3 sub-fields)

### Other column templates

| File | Renders | Use when | Placeholders |
|------|---------|----------|-------------|
| `col-currency.js` | ¥12,345.00 monospace | decimal/amount fields | `{FIELD}`, `{THRESHOLD}` |
| `col-countdown.js` | "⏱ 12 days left" / "⚠ 3 days overdue" | date fields + due/deadline concept | `{FIELD}` |
| `col-progress.js` | Colored bar + percentage | percentage/achievement rate/completion rate | `{FIELD}` |
| `col-stars.js` | ★★★★☆ | integer rating/score/satisfaction | `{FIELD}` |
| `col-relative-time.js` | "3 hours ago" / "2 days ago" | date + recent/creation time | `{FIELD}` |
| `col-comparison.js` | Target vs actual bar | target vs actual comparison | `{TARGET}`, `{ACTUAL}` |

### How to map HTML prototype → JS columns

Read the HTML prototype `<table>` section. For each column:
1. `<td>` with **two nested divs** (bold name + gray info) → `col-composite.js`
2. `<td>` with **¥ + monospace number** → `col-currency.js`
3. `<td>` with **"X days left"/"overdue"** → `col-countdown.js`
4. `<td>` with **progress bar** → `col-progress.js`
5. `<td>` with **"N hours ago"/"N days ago"** → `col-relative-time.js`
6. `<td>` with **stars** → `col-stars.js`
7. `<td>` with **just a tag/badge** → skip (NocoBase native select rendering)

## Block JS — Free-form code, diverse visualizations

Page-level blocks. Async context, `ctx.api` + `ctx.antd` available. **No templates — write original code for each block.**

### Basic Structure

```js
(async () => {
  const h = ctx.React.createElement;
  const { /* pick components */ } = ctx.antd;
  const r = await ctx.api.request({ url: 'collection:list', params: { paginate: false } });
  const data = r?.data?.data || [];
  // ... compute ...
  ctx.render(h('div', null, /* your visualization */));
})();
```

### Ant Design Component Quick Reference

| Component | Usage | Best for |
|-----------|-------|----------|
| `Statistic` | Large number + title | Key metrics (but don't use this for every block!) |
| `Progress` | `type="circle"` ring / `type="line"` bar | Achievement rate, completion, proportions |
| `Tag` | Colored tag | Status indicators, category labels |
| `List` + `List.Item` | List rendering | Rankings, recent records, alert lists |
| `Card` | Card container | Wrapping statistical info |
| `Row` + `Col` | 24-column grid layout | Side-by-side cards |
| `Alert` | Alert banner | Warnings, empty states |
| `Badge` | Corner badge / status dot | Count indicators |
| `Timeline` | Timeline | Event sequences, operation history |
| `Steps` | Step bar | Process stages |
| `Rate` | Star rating | Scores, satisfaction |
| `Descriptions` | Description list | Key-value pair details |
| `Typography.Text` | Rich text | Titles, descriptive text |
| `Tooltip` | Hover tooltip | Data details |
| `Space` + `Divider` | Spacing / divider | Layout helpers |
| `Empty` | Empty state | When no data |

### Custom Visualizations (div + inline style)

| Pattern | Implementation | Best for |
|---------|---------------|----------|
| Horizontal bar chart | div width proportional + color mapping | Distribution comparison |
| Donut/ring chart | SVG circle + stroke-dasharray | Proportion visualization |
| Mini area chart | SVG path + linearGradient | Trend comparison |
| Funnel chart | Centered decreasing-width bars | Conversion pipeline |
| Heatmap grid | CSS grid + background color intensity | Activity distribution |
| Mini column chart | flex container + vertical divs | Weekly/monthly comparison |

### Diversity Principle (mandatory)

1. **Multiple blocks on the same page MUST use different visualization patterns** — don't use Statistic for everything, don't use horizontal bar charts for everything
2. **Semantic colors**: `#52c41a` green = normal/growth, `#1890ff` blue = info, `#faad14` orange = warning, `#f5222d` red = danger/decline
3. **Information density**: Don't just show a single number — add trend arrows, period-over-period comparison, or contextual notes
4. **Ant Design enterprise style**: Clean and professional, proper whitespace, clear font hierarchy (title 14px, values 24-32px, helper text 12px)
5. **Data-driven**: Choose visualization based on data characteristics — categories -> bar/ring chart, time series -> trend chart, proportions -> Progress, rankings -> list

## Item Templates — `nb_inject_js(uid, code)`

Custom content inside detail views or forms. `ctx.record` available in detail context.

| File | Type | Placeholders |
|------|------|-------------|
| `item-lifecycle.js` | Status pipeline + progress bar | `{STATUS_FIELD}`, `{STAGES}`, `{STATUS_COLORS}` |
| `item-stats.js` | 2-4 computed statistics | `{STATS}` |
| `item-gauge.js` | Progress circle with label | `{VALUE_FIELD}`, `{TOTAL_FIELD}`, `{LABEL}` |

## Event Templates — `nb_inject_js(uid, code, event_name="...")`

Form event handlers. Three event types:
- `formValuesChange` — when any field changes (auto-calc, validation, cascading)
- `beforeRender` — when form opens (auto-fill defaults)
- `afterSubmit` — after successful submit (notifications, redirects)

| File | Event | Type | Placeholders |
|------|-------|------|-------------|
| `event-calc.js` | formValuesChange | Auto-calculate A*B→Result | `{FIELD_A}`, `{FIELD_B}`, `{RESULT}` |
| `event-mapping.js` | formValuesChange | Value→value lookup | `{TRIGGER}`, `{TARGET}`, `{MAP}` |
| `event-autofill.js` | beforeRender | Fill current user/date | `{FILLS}` |
| `event-validate.js` | formValuesChange | Cross-field validation | `{FIELD_A}`, `{FIELD_B}`, `{RULE}`, `{MESSAGE}` |
| `event-conditional.js` | formValuesChange | Conditional required fields | `{TRIGGER}`, `{TRIGGER_VALUES}`, `{TARGET_FIELDS}` |

## Column/Item/Event Placeholder Reference

| Placeholder | Format | Example |
|-------------|--------|---------|
| `{FIELD}` | field name string | `amount`, `status` |
| `{COLLECTION}` | table name | `nb_crm_customers` |
| `{COLOR_MAP}` | JS object literal | `{"High":"#ff4d4f","Medium":"#faad14","Low":"#52c41a"}` |
| `{STAGE_ORDER}` | JS array literal | `["Lead","Opportunity","Quote","Closed"]` |
| `{STATS}` | JSON array | `[{"title":"Original Value","field":"price","prefix":"¥"}]` |
| `{MAP}` | JS object literal | `{"VIP":"Grade A","Standard":"Grade B"}` |
| `{FILLS}` | JSON array | `[{"field":"reporter","source":"currentUser"},{"field":"date","source":"today"}]` |

> Note: Block JS does NOT use placeholder templates. Write original code for each block.
