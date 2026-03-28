# Layout Patterns & XML Reference

Read this when building pages in Phase 3. Do NOT read upfront.

## Composite Column Rule (MANDATORY)

**Every non-reference table MUST have a composite primary column.** Bold title + gray subtitle:
- Customer: "Huawei Technologies Co., Ltd." + "Shenzhen, Referral"
- Opportunity: "Enterprise Cloud Service Procurement" + "Created on 2024-01-15"

```xml
<js-col type="composite" field="name" subs="city,source" title="Customer">
  Blue bold name, gray subtitle showing city and source below
</js-col>
```

`subs` = subtitle fields, joined with " · ". Choose 2-3 fields that help identify the record.

## Layout Principles

**Table is the main content — don't bury it under stacked blocks.**

- **KPI strip** (3-5 `<kpi>` in one `<row>`): OK above table, takes minimal space
- **Charts/Stats**: Put them **beside** the table (right side), NOT above it
- **Filter**: Always directly above its target table

**Preferred**: KPIs on top, then filter, then table left + stats stacked right.
**Avoid**: Charts row, more charts row, filter, table.

## Patterns

### A: Table + Sidebar Stats (PREFERRED — most pages)
```xml
<page collection="{COLL}">
  <row>
    <kpi title="{KPI1}" />
    <kpi title="{KPI2}" filter="{F}={V}" color="blue" />
    <kpi title="{KPI3}" filter="{F}={V}" color="green" />
  </row>
  <filter fields="{FILTER}" target="tbl" />
  <row>
    <table id="tbl" span="16" fields="{COLS}">
      <js-col type="composite" field="{NAME}" subs="{SUB1},{SUB2}" title="{T}">{desc}</js-col>
    </table>
    <stack span="8">
      <js-block title="{CHART_A}">Distribution/Funnel/Trend</js-block>
      <js-block title="{STAT_B}">Statistics cards</js-block>
    </stack>
  </row>
</page>
```

### B: Wide Table + Narrow Sidebar (Monitor/Alert)
```xml
<page collection="{COLL}">
  <filter fields="{FILTER}" target="tbl" />
  <row>
    <table id="tbl" span="18" fields="{COLS}">
      <js-col type="composite" field="{NAME}" subs="{SUB1},{SUB2}" title="{T}">{desc}</js-col>
    </table>
    <stack span="6">
      <js-block title="{SIDE_A}">{desc}</js-block>
    </stack>
  </row>
</page>
```

### C: Financial (Summary + Table + Sidebar)
Same as A but sidebar has amount summary + trend blocks.

### D: Pipeline (Funnel + Table)
Same as A but span=14+10 (wider sidebar for funnel chart).

### E: Simple (Reference/Config)
```xml
<page collection="{COLL}">
  <filter fields="{FILTER}" target="tbl" />
  <table id="tbl" fields="{COLS}" />
</page>
```

### F: Dashboard + Progress (Target/Goal)
Same as D but sidebar has progress dashboard + ranking.

## XML Tag Reference

| Tag | Purpose | Key Attrs |
|-----|---------|-----------|
| `<page>` | Root | `collection` |
| `<row>` | Horizontal split | children use `span` (24-grid) |
| `<stack>` | Vertical stack in a column | `span` |
| `<kpi>` | Single number stat | `title`, `filter`, `color` |
| `<filter>` | Search bar | `fields`, `target` |
| `<table>` | Data table | `id`, `fields`, `title` |
| `<js-block>` | Visualization placeholder | `title`, `span`; text=description |
| `<js-col>` | Custom column placeholder | `type`, `field`, `subs`, `title` |

**`<kpi>` = ONE number count. `<js-block>` = ANY visualization.**
**JS column types**: composite, currency, countdown, progress, relative_time, stars, comparison.
**SKIP**: select/enum fields (NocoBase renders colored tags natively), plain text, relations.
**Forms auto-generate**: No `<addnew>/<edit>/<detail>` in XML.

## Layout Rules

1. Every non-reference page MUST use `<row>` with `span`
2. Table left (span=14-18) + stats right (span=6-10)
3. KPI strip is the ONLY thing above the table row
4. Asymmetric ratios: 14+10, 16+8, 18+6 (not 12+12)
5. Filter directly above the table row, full-width
6. Do NOT stack multiple chart rows above the table

## Grid Height Rule

Grid rows stretch to the tallest block. Fix: pair the table (tall) with stacked sidebar blocks.
```xml
<row>
  <table span="16">...</table>
  <stack span="8">
    <js-block>chart</js-block>
    <js-block>stats</js-block>
  </stack>
</row>
```
