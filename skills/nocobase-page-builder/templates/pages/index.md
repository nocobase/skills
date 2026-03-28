# Page Layout Patterns

Each pattern shows an XML markup template for `nb_page_markup`. Replace `{PLACEHOLDER}` with real values.

## Pattern → Template → JS Placeholder Mapping

This is the critical link: requirements pattern → which layout → which JS placeholders to include.

| Pattern | Layout | When to Use | JS Placeholders |
|---------|--------|-------------|-----------------|
| **A: KPI Strip** | KPI row → Chart row → Filter → Table | Core business pages focused on totals/counts | `<kpi>` row, `<js-block>` for charts |
| **B: Sidebar** | Filter → Table(16)+Stack(8) | Alert/monitor pages: due reminders, pending items, distribution stats in sidebar | `<js-block>` in `<stack>` sidebar |
| **C: Financial** | Banner → 3×Metric → Filter → Table | Financial pages: amount summary, amount by status | `<js-block>` banner + 3 metric blocks |
| **D: Pipeline** | Pipeline → Dist+Stats → Filter → Table | Stage-driven: funnel, stages, conversion rate | `<js-block>` pipeline + distribution |
| **E: Simple** | Filter → Table | Reference/config data with no KPIs | none |
| **F: Dashboard** | Progress+Ranking → Filter → Table | Target tracking: achievement rate, progress, rankings | `<js-block>` progress + ranking |

## How to Use (Step by Step)

1. **Determine pattern** from requirements "user focus" section (use mapping rules in checklist Step 3.1)
2. **Copy the XML template** for that pattern from below
3. **Replace placeholders**: collection names, field names, filter values
4. **Write JS placeholder descriptions** — describe what each `<js-block>`, `<js-col>` should render
5. **Add `<js-col>` to table** — match HTML prototype column patterns (see below)
6. Call `nb_page_markup(tab_uid, markup)` or write to batch file

## Pattern A: KPI Strip + Charts + Table

```xml
<page collection="{COLLECTION}">
  <row>
    <kpi title="{KPI_1_TITLE}" />
    <kpi title="{KPI_2_TITLE}" filter="{FIELD}={VALUE}" color="blue" />
    <kpi title="{KPI_3_TITLE}" filter="{FIELD}={VALUE}" color="green" />
  </row>
  <row>
    <js-block title="{CHART_A_TITLE}" span="10">{CHART_A_DESC}</js-block>
    <js-block title="{CHART_B_TITLE}" span="14">{CHART_B_DESC}</js-block>
  </row>
  <filter fields="{FILTER_FIELDS}" target="tbl" />
  <table id="tbl" fields="{TABLE_FIELDS}">
    <js-col type="composite" field="{PRIMARY_FIELD}" subs="{SUBS}" title="{COL_TITLE}">
      {COL_DESC}
    </js-col>
  </table>
  <!-- Forms (addnew/edit/detail) auto-generate with all fields. Refine in Phase 3B. -->
</page>
```

## Pattern B: Sidebar + Main

```xml
<page collection="{COLLECTION}">
  <filter fields="{FILTER_FIELDS}" target="tbl" />
  <row>
    <table id="tbl" span="16" fields="{TABLE_FIELDS}">
      <js-col type="composite" field="{PRIMARY_FIELD}" subs="{SUBS}" title="{COL_TITLE}">
        {COL_DESC}
      </js-col>
    </table>
    <stack span="8">
      <js-block title="{SIDEBAR_A_TITLE}">{SIDEBAR_A_DESC}</js-block>
      <js-block title="{SIDEBAR_B_TITLE}">{SIDEBAR_B_DESC}</js-block>
    </stack>
  </row>
</page>
```

## Pattern C: Financial (Banner + Metrics + Table)

```xml
<page collection="{COLLECTION}">
  <js-block title="{BANNER_TITLE}">{BANNER_DESC: total amount/received/pending}</js-block>
  <row>
    <js-block title="{METRIC_A}" span="8">{METRIC_A_DESC}</js-block>
    <js-block title="{METRIC_B}" span="8">{METRIC_B_DESC}</js-block>
    <js-block title="{METRIC_C}" span="8">{METRIC_C_DESC}</js-block>
  </row>
  <filter fields="{FILTER_FIELDS}" target="tbl" />
  <table id="tbl" fields="{TABLE_FIELDS}">
    <js-col type="currency" field="{AMOUNT_FIELD}" title="Amount" threshold="{THRESHOLD}">
      ¥ format, red highlight when exceeding threshold
    </js-col>
  </table>
</page>
```

## Pattern D: Pipeline

```xml
<page collection="{COLLECTION}">
  <js-block title="{PIPELINE_TITLE}">{PIPELINE_DESC: stage count funnel}</js-block>
  <row>
    <js-block title="{DIST_TITLE}" span="10">{DIST_DESC}</js-block>
    <js-block title="{STATS_TITLE}" span="14">{STATS_DESC}</js-block>
  </row>
  <filter fields="{FILTER_FIELDS}" target="tbl" />
  <table id="tbl" fields="{TABLE_FIELDS}">
    <js-col type="composite" field="{PRIMARY_FIELD}" subs="{SUBS}" title="{COL_TITLE}">
      {COL_DESC}
    </js-col>
  </table>
</page>
```

## Pattern E: Simple (Reference/Config)

```xml
<page collection="{COLLECTION}">
  <filter fields="{FILTER_FIELDS}" target="tbl" />
  <table id="tbl" fields="{TABLE_FIELDS}" />
</page>
```

No JS blocks needed. For Pattern E, you can also use `nb_crud_page` shortcut.

## Pattern F: Dashboard + Progress

```xml
<page collection="{COLLECTION}">
  <row>
    <js-block title="{PROGRESS_TITLE}" span="10">{PROGRESS_DESC: overall achievement rate circular progress}</js-block>
    <js-block title="{RANKING_TITLE}" span="14">{RANKING_DESC: Top N ranking list}</js-block>
  </row>
  <filter fields="{FILTER_FIELDS}" target="tbl" />
  <table id="tbl" fields="{TABLE_FIELDS}">
    <js-col type="progress" field="{PROGRESS_FIELD}" title="Achievement">
      Colored progress bar + percentage
    </js-col>
  </table>
</page>
```

## Table Block — JS Column Placeholders (Business-Driven)

Add `<js-col>` in Phase 1 when the table has fields that **NocoBase cannot render natively**. Do NOT force JS columns on every table.

### ★ MOST IMPORTANT: Every entity's primary column = composite

Look at the HTML prototypes — every entity's first column shows **bold title + gray subtitle**:
- Customer: "Huawei Technologies Co." + "Shenzhen - Referral"
- Opportunity: "Enterprise Cloud Service Procurement" + "Created 2024-01-15"
- Contract: "Cloud Service Annual Contract" + "2024-01-01 ~ 2024-12-31"

**Every non-reference table SHOULD have a composite primary column.**

### HTML `<td>` → JS column type mapping

| HTML prototype pattern | `<js-col>` type | Skip? |
|----------------------|----------|-------|
| Two nested `<div>` (bold name + gray info) | `composite` | |
| ¥ + monospace number | `currency` | |
| "X days left" / "X days overdue" countdown | `countdown` | |
| Progress bar + percentage | `progress` | |
| "N hours ago" / "N days ago" relative time | `relative_time` | |
| Stars / rating | `stars` | |
| Target vs actual bar | `comparison` | |
| Colored tag/badge (grade/status/type) | **SKIP** — NocoBase native | ✓ |
| Plain text | **SKIP** — NocoBase native | ✓ |
| Relation name | **SKIP** — NocoBase native | ✓ |

### Example — Contract table:

```xml
<table id="tbl" fields="title,customer_id,status,amount,end_date,createdAt">
  <js-col type="composite" field="title" subs="start_date,end_date" title="Contract">
    Bold blue contract name, gray start/end dates below
  </js-col>
  <js-col type="currency" field="amount" title="Amount" threshold="500000">
    ¥ format, red highlight when exceeding 500K
  </js-col>
  <js-col type="countdown" field="end_date" title="Expiry">
    N days left / N days overdue
  </js-col>
</table>
```
Note: `status` → select field → SKIP. `customer_id` → relation → SKIP.
**Forms (addnew/edit/detail) are auto-generated** — do NOT write them in XML. Refine in Phase 3B.

## Placeholders Reference

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{COLLECTION}` | Collection name | `nb_crm_customers` |
| `{TABLE_FIELDS}` | Comma-separated column names | `name,status,createdAt` |
| `{FILTER_FIELDS}` | Comma-separated searchable fields | `name,status` |
| `{PRIMARY_FIELD}` | Main name/title field | `name` |
| `{SUBS}` | Sub-fields for composite | `city,source` |
