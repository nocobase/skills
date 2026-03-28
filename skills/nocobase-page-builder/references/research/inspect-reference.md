---
title: "Page Inspection Tool Reference"
description: "nb_inspect_page MCP tool: converts FlowModel low-code pages into readable structured views for validation, comparison, and documentation"
tags: [nocobase, builder-toolkit, page-building, inspect, mcp-tool]
type: reference
status: active
updated: "2026-03-02"
sidebar:
  label: "Page Inspection"
  order: 4
---

# Page Inspection Tool Reference

> **Function**: Converts NocoBase 2.0 FlowPage low-code pages into a compact DSL structured view
> **Purpose**: Page validation, build result comparison, documentation generation, quality checks
> **Code location**: `mcp-server/src/nocobase_mcp/tools/page_tool.py` -- `PageTool.inspect()`

---

## MCP Tool List

| Tool Name | Function | Input |
|-----------|----------|-------|
| `nb_inspect_page` | Single page inspection | `page_title` |
| `nb_inspect_all` | Batch inspection | `prefix` (optional, e.g., "CRM") |
| `nb_show_page` | Raw tree structure | `page_title` |
| `nb_list_pages` | List all pages | None |
| `nb_locate_node` | Locate node UID | `page_title` + `block` / `field` |

---

## Output Format Description

### Basic Structure

Output is divided into two parts: **pseudo-HTML layout** (grid structure) + **detailed sections** (field-level details).

#### 1. Pseudo-HTML Layout (Top)

Uses `<grid>` / `<row>` / `<col span=N>` to reproduce the page's grid row/column structure, where `span` corresponds to the Ant Design 24-column grid. Each block is represented with a semantic tag:

```xml
# Page Title  (tab=<tab_uid>)

<grid>
  <row>
    <col span=6><kpi>Total Employees</kpi></col>
    <col span=6><kpi>Active Employees</kpi></col>
    <col span=6><kpi>Probation</kpi></col>
    <col span=6><kpi>Departed</kpi></col>
  </row>
  <row>
    <col span=24><filter fields="name" /></col>
  </row>
  <row>
    <col span=24><table collection="nb_hr_employees" columns=6 actions="AddNew,Edit,Detail" /></col>
  </row>
</grid>
```

**Multi-column layout** is expressed through multiple `<col>` elements within the same `<row>`, where `span` values sum to 24:

```xml
  <row>
    <col span=12><kpi>Asset Category Distribution</kpi></col>
    <col span=12><kpi>Asset Value Trend</kpi></col>
  </row>
```

**Vertical stacking** -- multiple child tags within the same `<col>` naturally express a top-to-bottom stacking relationship:

```xml
  <row>
    <col span=15>
      <chart />
      <ref template="Table: Tts Tickets (simple)" />
    </col>
    <col span=9>
      <actions>Popup, Link, Link</actions>
      <js code=3397>⏱️ SLA Compliance</js>
      <js code=3220>📊 Ticket Distribution by Type</js>
      <js code=2911>👥 Team Performance</js>
    </col>
  </row>
```

In the example above, the left column `span=15` has 2 blocks (chart + ref), and the right column `span=9` has 4 blocks stacked vertically.

**Block tags**:

| Block Type | Tag | Example |
|-----------|------|---------|
| KPI card (<=1000c) | `<kpi>title</kpi>` | `<kpi>Total Employees</kpi>` |
| JS chart (>1000c) | `<js code=N>title</js>` | `<js code=2086>Sales Funnel</js>` |
| Filter | `<filter fields="..." />` | `<filter fields="name, status" />` |
| Table | `<table collection="..." columns=N />` | `<table collection="nb_hr_employees" columns=6 actions="AddNew,Edit" />` |
| Reference | `<ref template="..." />` | `<ref template="Table: Tickets" />` |
| Details | `<details collection="..." />` | `<details collection="nb_am_assets" />` |
| Action panel | `<actions>...</actions>` | `<actions>Popup, Link</actions>` |
| Chart block | `<chart />` | `<chart />` |
| AI shortcuts | `<ai-shortcuts />` | `<ai-shortcuts />` |
| List | `<list collection="..." />` | `<list collection="nb_crm_leads" />` |
| Form | `<form collection="..." />` | `<form collection="nb_hr_employees" />` |

#### 2. Detailed Sections (Below)

After the ASCII layout, output is organized into type-based detailed sections providing field-level details:

```
## KPIs (Nx, inline/stacked, 6|6|6|6)
   "KPI Name 1" | "KPI Name 2" | "KPI Name 3" | "KPI Name 4"

## JSBlock "Title" [Nc] (size=N)          <- Large JS block (chart/dashboard, >1000c)

## Filter
   filter_fields: ["field1", "field2"]

## Table "Title"  (collection_name)
   table_fields: ["col1", "col2", "col3"]
   js_columns: ["JS Column Title"]

   ### AddNew
       --- Section Title
       field1* | field2             <- * means required, | means same row
       field3

   ### Edit
       (same format as AddNew)

   ### Detail Popup
       mode=drawer, size=large
       Tab "Details":
         Details:
         field1 | field2
         field3
       Tab "Sub-table":
         SubTable child_collection: ["col1", "col2"]

## Reference: "Template Name"               <- Reference block (template)
   Table "Title" (collection): [cols]
   Detail Popup:                            <- Popups within reference blocks are also parsed
     ...

## ActionPanel: [Popup(...), Link("Title")]

## AI Shortcuts: username:label, ...
```

### Symbol Meanings

| Symbol | Meaning |
|--------|---------|
| `*` | Required field |
| `\|` | Same-row fields (gridSettings same-row columns) |
| `---` | Form divider (DividerItemModel) |
| `--- Title` | Divider with title |
| `[Nc]` | JS code length (character count) |
| `(size=N)` | Width in Ant Design 24-column grid |
| `(cycle, skip)` | Cycle detected in reference graph, skipped to avoid infinite recursion |

---

## Key Features

### 1. Reference Resolution

`ReferenceBlockModel` (reference blocks) and `popupTemplateUid` (popup templates) within pages are **resolved one level deep**, displaying the actual content.

- Resolves template UID to `targetUid` via the `flowModelTemplates` API
- Uses a `visited` set to prevent circular references (graph cycle issue)
- Resolves at most one level, preventing infinite nesting

**Example**: Dashboard page with reference table + template popup

```
## Reference: "Table: Tts Tickets (simple)"
   Table "📥 My Tickets" (nb_tts_tickets): ["ticket_no", "title", "status"]
   js_columns: ["SLA"]
   Detail Popup:
     mode=drawer, size=large
     Tab "Details":
       Layout: [16, 8]
       Details:  (1 JSItem, actions=[UpdateRecord])
       ticket_no | biz_type_mto | priority
       status | source_channel | createdAt
       ActionPanel: [Popup(drawer,), Popup(dialog,...)]
       JSBlock (untitled) [4876c]
```

### 2. KPI vs Chart Differentiation

JS blocks (JSBlockModel) are automatically categorized by code length:

| Type | Condition | Display |
|------|-----------|---------|
| KPI card | Code <= 1000 characters | `## KPIs (Nx, inline, 6\|6\|6)` |
| Chart/dashboard | Code > 1000 characters | `## JSBlock "Title" [Nc] (size=N)` |

KPI cards also check layout:
- `inline`: arranged in a row (normal)
- `stacked`: arranged in multiple rows (flagged with `!! LAYOUT BUG`, KPIs should be in a single row)

### 3. Detail Popup Deep Parsing

Detail popups display their full structure:
- Multiple tabs (`ChildPageTabModel`)
- Block types within each tab: Details / SubTable / JSBlock / Form / ActionPanel
- Two-column layout: `Layout: [16, 8]`
- Nested JSItem and Action button counts
- Sub-table fields and JS columns

### 4. Popup Template Resolution

When a click field uses `popupTemplateUid` to reference a popup template:
1. Looks up the template via the `flowModelTemplates:list` API
2. Gets the `targetUid` (root of the FlowModel subtree where actual content resides)
3. The template target may have a `DisplayTextFieldModel` -> `ChildPageModel` -> `ChildPageTabModel` structure
4. Recursively parses template content, protected by the `visited` set

---

## Use Cases

### Validating Build Results

After building, use `nb_inspect_page` to check whether the page structure matches expectations:

```
# Validate a single page
nb_inspect_page("Asset Ledger")

# Validate an entire system
nb_inspect_all("CRM")
```

Compare the output with `nb_crud_page` input parameters to confirm:
- Whether KPI count and layout are correct
- Whether table columns are complete
- Whether form fields include required markers and dividers
- Whether detail popups have content (not empty)
- Whether sub-tables are correctly associated

### Quality Check Checklist

First examine the `<grid>` layout to assess spatial arrangement, then review the detailed sections to check field content:

| Check Item | Where to Look | Normal | Abnormal |
|------------|---------------|--------|----------|
| Block ordering | `<grid>` | `<row>` order: KPI -> Filter -> Table | Table above KPI |
| Side-by-side columns | `<grid>` | Multiple `<col>` within the same `<row>` | Blocks that should be side-by-side in different `<row>`s |
| Column widths correct | `<grid>` | `span=6` x 4 = 24, or `span=12` x 2 = 24 | span sum != 24 |
| KPI layout | Detailed sections | `inline, 6\|6\|6\|6` | `stacked` + LAYOUT BUG |
| Detail popup | Detailed sections | `Tab "Details": Details: ...` | `(empty)` |
| Required fields | Detailed sections | `name*` | Missing `*` |
| Form dividers | Detailed sections | `--- Basic Info` | All fields continuous without dividers |
| JS columns | Detailed sections | `js_columns: ["Status"]` | Missing |
| Sub-tables | Detailed sections | `SubTable coll: [cols]` | Missing association table labels |

### Documentation Generation

Batch inspection can be used to generate a page asset inventory for the system:

```
# Output all pages to file
nb_inspect_all()
```

---

## Implementation Details

### Core Methods

| Method | Responsibility |
|--------|---------------|
| `inspect()` | Entry point: find tab UID -> build tree -> dispatch to `_inspect_grid` |
| `_grid_layout()` | **Pseudo-HTML layout**: traverse gridSettings.rows/sizes, generate `<grid>/<row>/<col>` structure |
| `_block_tag()` | **Block tags**: generate pseudo-HTML tags based on use type (`<kpi>/<js>/<table>`, etc.) |
| `_inspect_grid()` | Calls `_grid_layout` first, then categorizes blocks: KPI / Chart / Filter / Table / Other / AI |
| `_inspect_table()` | Table: columns + JS columns + AddNew/Edit forms + detail popup |
| `_inspect_other_block()` | Reference / ActionPanel / Chart / Details |
| `_inspect_resolved_ref()` | Resolve reference target content + table popups |
| `_find_detail_popup()` | Find clickToOpen column -> parse popup template |
| `_describe_popup()` | Popup tab structure -> delegate to `_describe_block` |
| `_describe_block()` | Generic block description: Details/Table/JS/Action/Ref/Form |
| `_resolve_template_target()` | `popupTemplateUid` -> `flowModelTemplates` -> `targetUid` |

### Data Flow

```
inspect(page_title)
  -> _find_tab_uid(page_title)     # desktopRoutes API -> tab schemaUid
  -> _build_tree(tab_uid)          # flowModels:list -> recursively build subtree
  -> _inspect_grid(tree)           # gridSettings.rows/sizes -> two-phase output
       |
       |-- Phase 1: _grid_layout()        # Pseudo-HTML layout (<grid>/<row>/<col>)
       |    +-- Traverse rows -> each row -> each col -> _block_tag() -> semantic tags
       |
       +-- Phase 2: Detailed sections     # Field-level details
            |-- KPIs: JSBlock <=1000c
            |-- Charts: JSBlock >1000c
            |-- Filter: FilterFormModel -> filter fields
            |-- Table: _inspect_table()
            |    |-- columns + JS columns
            |    |-- AddNew/Edit: _extract_form_dsl()
            |    +-- Detail: _find_detail_popup()
            |         |-- clickToOpen column -> popup UID
            |         |-- popupTemplateUid? -> _resolve_template_target()
            |         +-- _describe_popup() -> tabs/blocks
            |-- Reference: _inspect_resolved_ref()
            |    +-- targetUid -> Table/Form/Details
            +-- AI Shortcuts
```

---

## Example Output

### HRM Employee Roster (Standard CRUD Page)

```xml
# Employee Roster  (tab=8o4y60xy5v6)

<grid>
  <row>
    <col span=6><kpi>Total Employees</kpi></col>
    <col span=6><kpi>Active Employees</kpi></col>
    <col span=6><kpi>Probation</kpi></col>
    <col span=6><kpi>Departed</kpi></col>
  </row>
  <row>
    <col span=24><filter fields="name" /></col>
  </row>
  <row>
    <col span=24><table collection="nb_hr_employees" columns=6 actions="AddNew,Edit,Detail" /></col>
  </row>
</grid>

## KPIs (4x, inline, 6|6|6|6)
   "Total Employees" [JS 564c] | "Active Employees" [JS 617c] | "Probation" [JS 621c] | "Departed" [JS 615c]

## Table  (nb_hr_employees)
   table_fields: ["name", "employee_no", "department", "position", "entry_date", "status"]

   ### AddNew
       ---
       name* | employee_no*
       gender | birth_date
       ...
```

### AM Asset Ledger (Multi-column + Different Spans)

The second row with `span=12` + `span=12` indicates two charts side by side:

```xml
# Asset Ledger  (tab=stqcb11iba2)

<grid>
  <row>
    <col span=6><kpi>Total Assets</kpi></col>
    <col span=6><kpi>In Use</kpi></col>
    <col span=6><kpi>In Stock</kpi></col>
    <col span=6><kpi>Under Repair</kpi></col>
  </row>
  <row>
    <col span=12><kpi>Asset Category Distribution</kpi></col>
    <col span=12><kpi>Asset Value Trend</kpi></col>
  </row>
  <row>
    <col span=24><filter fields="name" /></col>
  </row>
  <row>
    <col span=24><table collection="nb_am_assets" columns=11 js=1 actions="AddNew,Edit,Detail:1tabs" /></col>
  </row>
</grid>

## KPIs (6x, stacked, 24 each)
   ...
```

### Dashboard (Vertical Stacking + Unequal Multi-column)

Left column `span=15` stacks 2 blocks, right column `span=9` stacks 4 blocks:

```xml
# Dashboard  (tab=48dv5z94n7n)

<grid>
  <row>
    <col span=6><js code=1979>untitled</js></col>
    <col span=6><js code=1569>untitled</js></col>
    <col span=6><js code=2086>untitled</js></col>
    <col span=6><js code=2717>untitled</js></col>
  </row>
  <row>
    <col span=15>
      <chart />
      <ref template="Table: Tts Tickets (simple)" />
    </col>
    <col span=9>
      <actions>Popup, Link, Link</actions>
      <js code=3397>⏱️ SLA Compliance</js>
      <js code=3220>📊 Ticket Distribution by Type</js>
      <js code=2911>👥 Team Performance</js>
    </col>
  </row>
</grid>

## JSBlock "(untitled)" [1979c] (size=6)
...
```

---

## Related Documents

- [Page Building Standard Workflow](/300000-projects/300008-nocobase-builder/02-page-building/usage/) -- Building operation workflow
- [JS Block Reference](/300000-projects/300008-nocobase-builder/02-page-building/js-blocks-reference/) -- JS column/card code reference
- [Fully Automated Building Workflow Overview](/300000-projects/300008-nocobase-builder/automation-overview/) -- Builder Toolkit overview
- [AM AI Employee Design](/300000-projects/300008-nocobase-builder/04-ai-employee/am-ai-employees/) -- AI Employee + page integration
