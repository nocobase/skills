---
name: nocobase-page-builder
description: Build NocoBase pages via Python scripts. XML markup DSL for declarative page building, JS auto-generation, page inspection and incremental mutation. Assumes collections and fields already exist.
allowed-tools: Bash (to run Python scripts), Read, Write, Edit
---

# nocobase-page-builder

Build NocoBase page UI by writing Python scripts that call the NocoBase REST API through the `NB` client library.

**Scope**: This skill handles page/route creation, XML markup page building, JS injection, page inspection, and incremental mutation. It does NOT handle data modeling (collections, fields, relations) or workflow creation — those are handled by `nocobase-data-modeling` and `nocobase-workflow-manage` respectively.

**Prerequisite**: Collections and fields must already exist before building pages. Use `nb.fields(collection)` to verify.

## When to trigger

- Building or rebuilding pages with XML markup DSL
- Auto-generating and injecting JS code
- Inspecting or modifying existing pages
- Exporting page structures as JSON for analysis

## When NOT to trigger

- Creating collections, fields, or relations -> `nocobase-data-modeling`
- Creating workflows -> `nocobase-workflow-manage`
- MCP connection setup -> `nocobase-mcp-setup`

## Setup

Install the Python library:

```bash
cd skills/nocobase-page-builder/mcp-server
pip install -e .
```

Every script starts with:

```python
from nocobase_mcp.client import NB
from nocobase_mcp.markup_parser import PageMarkupParser

nb = NB(base_url="http://localhost:14000",
        account="admin@nocobase.com", password="admin123")
parser = PageMarkupParser(nb)
```

Environment variables `NB_URL`, `NB_USER`, `NB_PASSWORD` are also supported.

## Build pipeline

**Prerequisite**: Verify collections and fields exist first:
```python
print(nb.fields("crm_customers"))  # Should list name, status, phone, etc.
```

Then build pages in 3 steps:

```
Step 1: Routes     →  nb.menu("CRM", None, [["Customers","TeamOutlined"], ...])
Step 2: Pages      →  parser.parse(tu, xml) → nb.save_nested(root, tu)    ← core step
Step 3: JS         →  nb.auto_js() → edit [todo] stubs → nb.inject_js()
```

### Step 1: Create routes

```python
result = nb.menu("CRM", None, [
    ["Customers", "TeamOutlined"],
    ["Opportunities", "FundOutlined"],
    ["Orders", "ShoppingOutlined"],
])
# result = {"group_id": 1, "Customers": "tu_xxx", "Opportunities": "tu_yyy", ...}
tu_customers = result["Customers"]
```

> Warning: `nb.menu()` is NOT idempotent — calling it twice creates duplicate groups. Check `nb.list_routes()` first, or use `nb.clean_tab(tu)` + `nb.delete_route(id)` to clean up before rebuilding.

### Step 2: Build pages with XML markup

**This is the core step.** One `parser.parse()` + `save_nested()` builds an entire page: filter, table, forms, detail popup with tabs, JS placeholders, sidebar charts — everything.

```python
markup = """
<page collection="crm_customers">
  <filter fields="name,status,level,industry" target="tbl" stats="status" />
  <row>
    <table id="tbl" span="17" fields="name,industry,status,level,phone,owner,createdAt">
      <js-col type="composite" field="name" title="Customer">Bold name, gray industry</js-col>
      <addnew>
        <section title="Company">
          <row><field name="name" required="true" /><field name="industry" /></row>
          <row><field name="status" /><field name="level" /></row>
        </section>
        <section title="Contact">
          <row><field name="phone" /><field name="owner" /></row>
        </section>
      </addnew>
      <edit>
        <section title="Company">
          <row><field name="name" required="true" /><field name="industry" /></row>
          <row><field name="status" /><field name="level" /></row>
        </section>
        <section title="Contact">
          <row><field name="phone" /><field name="website" /></row>
          <field name="owner" />
        </section>
      </edit>
      <detail>
        <tab title="Overview" fields="name|industry\\nstatus|level\\nphone|website\\nowner" />
        <tab title="Contacts" assoc="contacts" collection="crm_contacts"
             fields="name,title,phone,email,is_primary" />
        <tab title="Orders" assoc="orders" collection="crm_orders"
             fields="order_no,title,order_amount,status,order_date" />
      </detail>
    </table>
    <stack span="7">
      <js-block title="Industry Distribution">Bar chart by industry</js-block>
      <js-block title="Customer Levels">Donut chart by level</js-block>
    </stack>
  </row>
</page>
"""

nb.clean_tab(tu_customers)  # Always clean before rebuild
root, meta = parser.parse(tu_customers, markup)
nb.save_nested(root, tu_customers, filter_manager=meta.get("_filter_manager"))
```

> **Form field layout — MUST use `<section>/<row>/<field>` children**
>
> Forms with 4+ fields MUST use XML children with section dividers. Do NOT use `fields="..."` attribute for forms — it produces flat layouts without grouping.
>
> ```xml
> <addnew>
>   <section title="Basic Info">
>     <row><field name="name" required="true" /><field name="employee_no" /></row>
>     <row><field name="status" /><field name="gender" /></row>
>   </section>
>   <section title="Work">
>     <row><field name="department" /><field name="position" /></row>
>     <row><field name="hire_date" /><field name="education" /></row>
>   </section>
>   <section title="Contact">
>     <row><field name="phone" /><field name="email" /></row>
>   </section>
> </addnew>
> ```
>
> Rules:
> - Each `<section>` creates a visual divider with title
> - Each `<row>` puts fields side by side (max 4 per row, 2 recommended)
> - `<field>` outside `<row>` = full width
> - `required="true"` marks a field as mandatory
> - Use the same pattern for `<edit>` (usually same fields as addnew)
>
> For detail `<tab>` fields, use pipe syntax: `fields="name|status\\ndept|position"` (sections not yet supported in detail tabs).
>
> **Known limitation**: `<tab assoc="...">` for association sub-tables in detail popups is not yet functional. Use `<subtable>` inside a tab instead, or build sub-tables programmatically.

### Step 3: JS auto-generation and injection

```python
import os

# Auto-generate JS files from placeholders + built-in templates
templates_dir = "skills/nocobase-page-builder/templates/js/"
result = nb.auto_js("CRM", "/tmp/crm-js/", templates_dir)
print(f"Auto: {result['auto_count']}, Manual: {result['manual_count']}")

# Review [todo] stubs, write custom code, then inject all
for fname in sorted(os.listdir("/tmp/crm-js/")):
    if not fname.endswith(".js"):
        continue
    code = open(f"/tmp/crm-js/{fname}").read().strip()
    if code and not code.startswith("// TODO"):
        nb.inject_js(fname.replace(".js", ""), code)
```

## Page export and analysis

Export complete page trees as JSON for debugging, structure analysis, or as reference:

```bash
python scripts/export_pages.py --base http://localhost:14000 --output ./export --prefix "CRM"
```

This exports `_routes.json` (full route tree) + one JSON file per page (complete FlowModel node tree including all popups, event flows, and JS code).

See [references/research/export-page-json.md](references/research/export-page-json.md) for details. Example exports are in [examples/exported-json/](examples/exported-json/).

## Incremental maintenance

XML markup always builds a complete page from scratch. For modifying existing pages without rebuilding:

```python
# 1. Understand current state
print(nb.inspect_page("Customers"))   # returns a string, must print
# Or export JSON for detailed analysis

# 2. Locate the node to change
uid = nb.locate_node("Customers", block="table", field="status")

# 3. Make targeted changes
nb.patch_field(uid, required=True, default_value="new")
nb.add_column_to_table(table_uid, "crm_customers", "email")
nb.inject_js(js_block_uid, "ctx.render(...)")

# 4. Or replace an entire form/detail section
nb.set_form(table_uid, "edit", "name\\nstatus\\nlevel\\nowner\\ndescription")
nb.set_detail(table_uid, '<detail><tab title="Overview" fields="..." /></detail>')
```

There is no JSON-to-XML conversion. If changes are extensive, it is faster to `nb.clean_tab(tu)` and rebuild the entire page with XML.

### Available mutation methods

| Method | What it does |
|--------|-------------|
| `nb.inspect_page(title)` → str | Page structure tree (must be printed) |
| `nb.locate_node(scope, block, field)` | Find node UID |
| `nb.read_node(uid)` | Read full node config |
| `nb.patch_field(uid, required=, hidden=, ...)` | Patch form field properties |
| `nb.patch_column(uid, width=, title=)` | Patch table column properties |
| `nb.add_field_to_form(grid_uid, collection, field)` | Add field to form + update grid |
| `nb.add_column_to_table(table_uid, collection, field)` | Add column to table |
| `nb.remove_node(uid)` | Remove any node + children |
| `nb.set_form(tbl, type, markup)` | Replace entire addnew/edit form |
| `nb.set_detail(tbl, markup)` | Replace entire detail popup |
| `nb.inject_js(uid, code)` | Inject or update JS code (with validation) |
| `nb.update_js(uid, code)` | Update JS (soft, no validation) |

## XML Markup DSL reference

| Tag | Purpose | Key attributes |
|-----|---------|---------------|
| `<page>` | Root element | `collection` |
| `<filter>` | Filter form | `fields`, `target`, `stats` |
| `<table>` | Data table | `id`, `fields`, `span` |
| `<form>` | Standalone form | `collection`, `fields`, `mode` |
| `<detail-block>` | Standalone detail | `collection`, `fields` |
| `<chart>` | ECharts SQL chart | `title`, `sql`, `option`, `events` (or child elements) |
| `<js-block>` | JS block | `title`, `collection` |
| `<js-col>` | JS column | `type`, `field`, `title` |
| `<js-item>` | JS item (in detail) | `title` |
| `<kpi>` | Statistic card | `title`, `filter`, `color` |
| `<row>` | Horizontal row | Child `span` controls width |
| `<stack>` | Vertical stack | `span` |
| `<addnew>` | Create form popup | MUST use `<section>/<row>/<field>` children (see below) |
| `<edit>` | Edit form popup | Same as addnew |
| `<detail>` | Detail popup | Contains `<tab>` children |
| `<tab>` | Popup tab | `title`, `fields`, `assoc`, `collection` |
| `<subtable>` | Association sub-table | `assoc`, `collection`, `fields` |
| `<event>` | Event flow placeholder | `type` (formValuesChange, beforeRender, etc.) |
| `<section>` | Form section divider | `title` |

### Writing JS requirements in XML — follow the CRM pattern

Good JS comes from good requirements. Each page should have a "user focus" section describing **what the user sees and how data should be displayed**. This drives JS column/block choices.

See [examples/crm-requirements.md](examples/crm-requirements.md) for the full reference. Key pattern:

```
Requirement (from user focus)                    → XML tag
─────────────────────────────────────────────────────────────
"Amount in ¥X,XXX.XX, highlight >100K"           → <js-col type="currency" field="amount">¥ format, red >100K</js-col>
"Countdown to close date (N days / overdue)"      → <js-col type="countdown" field="expected_close_date">Days remaining</js-col>
"Win probability as progress bar"                 → <js-col type="progress" field="win_probability">0-100%</js-col>
"Status distribution stats at top"                → <filter stats="status" />
"Pipeline amount by stage (funnel)"               → <js-block title="Pipeline">Funnel chart by stage</js-block>
"Bold name + gray subtitle"                       → <js-col type="composite" field="name">Bold name, gray industry</js-col>
"Star rating display"                             → <js-col type="stars" field="rating">5-star rating</js-col>
```

### When to use JS columns — ONLY for logic-driven rendering

NocoBase natively renders all basic field types (text, select tags, dates, numbers, relations). **JS is only needed when the rendering involves logic, aggregation, or multi-field composition.**

Three valid reasons for `<js-col>`:

1. **Multi-field composition** — combine 2+ fields into one column
   - `<js-col type="composite" field="name">Bold name, gray industry + country. VIP badge when level=vip.</js-col>`

2. **Logic-driven display** — rendering changes based on value conditions
   - `<js-col type="countdown" field="close_date">Red when overdue, orange <30 days, green otherwise</js-col>`
   - `<js-col type="currency" field="amount">¥ format, bold red when >100K</js-col>`
   - `<js-col type="progress" field="probability">Color-coded bar 0-100%</js-col>`

3. **Aggregated/computed display** — value derived from calculation or API query
   - `<js-block title="Pipeline by Stage">Funnel chart: sum(amount) grouped by stage</js-block>`
   - `<js-block title="Monthly Trend">Line chart: count by month from activities</js-block>`

**Do NOT use JS for single-field simple display** — NocoBase handles these natively:
- Relation fields → clickable links with target title
- Select/enum → colored tags
- Dates → formatted display
- Numbers → formatted display
- A single field with just a color change → use field's built-in settings instead

### JS column types (auto-generated via `<js-col type="...">`)

| Type | Renders as | Example |
|------|-----------|---------|
| `composite` | Bold title + gray subtitles | Customer name + industry |
| `currency` | Formatted money | $12,345.00 |
| `countdown` | Days remaining/overdue | "12 days left" |
| `progress` | Colored bar + percentage | 75% progress |
| `stars` | Star rating | 4/5 stars |
| `relative_time` | Relative timestamp | "3 hours ago" |
| `comparison` | Target vs actual bar | Budget comparison |

## NB client method reference

### Routes
- `nb.menu(group_title, parent_id, pages)` — Create group + child pages (returns tab_uids)
- `nb.group(title, parent_id)` — Create menu folder
- `nb.route(title, parent_id)` — Create page (returns rid, pu, tu)
- `nb.list_routes()` — List all routes
- `nb.delete_route(route_id)` — Delete route

### Page building (XML markup)
- `PageMarkupParser(nb).parse(tu, xml)` — Parse XML → TreeNode tree
- `nb.save_nested(root, tu, filter_manager)` — Save tree in one API call
- `nb.clean_tab(tu)` — Delete all content under a tab (before rebuild)

### Charts (ECharts via SQL)
- `nb.chart(parent_grid, sql, option_js, title, events_js)` — Create ChartBlockModel + flowSql (two-step)

**Chart option JS rules (CRITICAL — charts won't render if violated):**

```javascript
// CORRECT: plain var + return, use ctx.data.objects
var data = ctx.data.objects || [];
var names = data.map(function(r){ return r.name; });
var counts = data.map(function(r){ return r.count; });
return {
  title: { text: 'My Chart', left: 'center' },
  xAxis: { type: 'category', data: names },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: counts }]
};
```

| Rule | Correct | Wrong |
|------|---------|-------|
| Data access | `ctx.data.objects` | `ctx.data` |
| Format | plain `var ... return {...}` | `(function(){...})()` IIFE |
| Functions | `function(r){ return r.x; }` | `r => r.x` (arrow forbidden) |
| Variables | `var` | `const` / `let` (may fail in SES) |
| SQL syntax | PostgreSQL (`date_trunc`, `"camelCase"`) | MySQL (`DATE_FORMAT`) |

### JS injection
- `nb.auto_js(scope, output_dir, templates_dir)` — Auto-generate JS from placeholders
- `nb.inject_js(uid, code)` — Inject JS with validation
- `nb.update_js(uid, code)` — Update JS (no validation)
- `nb.find_placeholders(scope)` — Find all JS placeholder nodes
- `nb.auto_forms(scope)` — Assess form field coverage

### Page inspection & mutation
- `nb.inspect_page(title)` → str — Page structure tree (must print)
- `nb.locate_node(scope, block, field)` — Find node UID
- `nb.read_node(uid)` — Read full node config
- `nb.patch_field(uid, ...)` — Patch form field
- `nb.patch_column(uid, ...)` — Patch table column
- `nb.add_field_to_form(grid_uid, coll, field)` — Add field + update grid
- `nb.add_column_to_table(tbl_uid, coll, field)` — Add column
- `nb.remove_node(uid)` — Remove node + children
- `nb.set_form(tbl, type, markup)` — Replace form
- `nb.set_detail(tbl, markup)` — Replace detail popup

### Utility
- `nb.fields(coll)` — Print field listing (verify fields exist before building)
- `nb.list_collections(prefix)` — List collections

## Reference docs

- [references/index.md](references/index.md) — Full reference index
- [references/gotchas.md](references/gotchas.md) — Critical gotchas (must read before any work!)
- [references/phases/](references/phases/) — Phase-by-phase build guides
- [references/research/](references/research/) — Deep research on FlowModel API internals
- [references/research/export-page-json.md](references/research/export-page-json.md) — Page export principle and JSON structure
- [templates/](templates/) — JS / page / workflow templates
- [examples/](examples/) — CRM XML markup, quick start guide, exported JSON samples
