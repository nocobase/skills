---
name: nocobase-page-building
description: Guide AI to build NocoBase pages — XML markup, placeholders, two-phase workflow
triggers:
  - build page
  - create menu
  - page
  - block
  - page
  - build page
  - create menu
  - table block
  - form
  - placeholder
  - placeholder
tools:
  - nb_page_markup
  - nb_page_markup_file
  - nb_compose_page
  - nb_compose_page_file
  - nb_crud_page
  - nb_crud_page_file
  - nb_find_placeholders
  - nb_inject_js
  - nb_inject_js_dir
  - nb_js_enhance_file
  - nb_create_group
  - nb_create_page
  - nb_create_menu
  - nb_list_routes
  - nb_delete_route
  - nb_clean_tab
  - nb_inspect_page
  - nb_inspect_all
  - nb_read_node
  - nb_locate_node
  - nb_patch_field
  - nb_patch_column
  - nb_add_field
  - nb_remove_field
  - nb_add_column
  - nb_remove_column
  - nb_list_pages
---

# NocoBase Page Building

## Core Philosophy: Two-Phase Build

This toolkit uses a **two-phase approach** for page building:

1. **Phase 1 (Structure)**: `nb_page_markup` builds the full page from XML markup.
   All JS nodes (columns, blocks, items, events) are **description-only placeholders**.
   No actual JS code is written in this phase.

2. **Phase 2 (JS Implementation)**: `nb_find_placeholders` discovers all placeholders,
   then `nb_inject_js` replaces each with real JS code. Each JS task is independent —
   can be parallelized, retried individually.

**Benefits**:
- No JS code in XML → clean, readable page definitions
- Independent JS tasks → parallel execution, isolated debugging
- Placeholder descriptions → clear requirements for each JS piece

---

## Key Concepts

### Group vs Page
- **Group**: Folder in sidebar. NO content, only holds children.
- **Page**: Has actual content (tables, forms, etc.). Must be under a group.

### FlowModel Tree Structure
```
Tab (RouteModel)
  └── BlockGridModel (layout container)
        ├── TableBlockModel (table)
        │     ├── TableColumnModel (column) → DisplayFieldModel
        │     ├── JSColumnModel (placeholder → real JS)
        │     ├── AddNewActionModel → ChildPageModel → CreateFormModel
        │     ├── TableActionsColumnModel → EditActionModel
        │     └── FilterActionModel, RefreshActionModel
        ├── FilterFormBlockModel (search bar)
        ├── JSBlockModel (placeholder → real JS)
        └── ...more blocks
```

### CRITICAL: FlowModel API is Full Replace
The `flowModels:update` API does a **full replace**, not incremental merge. The client always does GET → deep_merge → PUT internally. Never send partial data.

## Primary Tool: nb_page_markup (XML Markup)

Build a page from XML markup. JS nodes are description-only placeholders.

```xml
<page collection="nb_crm_customers">
  <row>
    <kpi title="Total Customers" />
    <kpi title="Following Up" filter="status=following" color="blue" />
  </row>
  <filter fields="name,status" target="tbl" />
  <table id="tbl" fields="name,status,phone,createdAt">
    <js-col type="composite" field="name" subs="city,source" title="Customer">
      Bold blue customer name, gray subtitle showing city and source below
    </js-col>
    <addnew fields="name*|code\nstatus|industry" />
    <edit fields="name*|code\nstatus|industry" />
    <detail>
      <tab title="Info" fields="name|code\nstatus|industry" />
      <tab title="Contacts">
        <subtable collection="nb_crm_contacts" assoc="contacts" fields="name,phone,position" />
      </tab>
    </detail>
  </table>
</page>
```

**Supported tags**: `<page>`, `<row>`, `<stack>`, `<kpi>`, `<filter>`, `<table>`,
`<js-col>`, `<js-block>`, `<js-item>`, `<addnew>`, `<edit>`, `<detail>`, `<tab>`,
`<subtable>`, `<event>`, `<form>`, `<detail-block>`

For 3+ pages, use `nb_page_markup_file(file_path)` — write JSON array `[{tab_uid, markup}, ...]`.

### Alternative: nb_compose_page (JSON blocks)

For programmatic page construction with full JS code inline:
```
nb_compose_page(tab_uid, blocks_json, layout_json?)
```
Block types: `table`, `filter`, `form`, `detail`, `js`, `kpi`, `outline`

### Quick CRUD shortcut — nb_crud_page

For simple data management pages (just list + create + edit + detail):
```
nb_crud_page(tab_uid, collection, table_fields, form_fields, filter_fields?, kpis_json?, detail_json?)
```

## Phase 2: JS Implementation

After building pages with `nb_page_markup`:

```
# 1. Discover all placeholders
nb_find_placeholders("CRM")
# Returns: [{uid, kind, title, desc, field, collection, parent_uid}, ...]

# 2. Implement each placeholder
nb_inject_js(uid, code)                                    # blocks, columns, items
nb_inject_js(uid, code, event_name="formValuesChange")     # events

# 3. Or batch via file
nb_js_enhance_file(file_path)
# File: [{"action":"update","uid":"xxx","code":"...","title":"..."}, ...]
```

### JS Sandbox

**Columns & Blocks**: `ctx.React`, `ctx.antd` (full Ant Design 5), `ctx.api`, `ctx.render(el)`, `ctx.record` (columns), `ctx.themeToken`
**Event Flows**: `ctx.form` (.values, .setFieldsValue), `ctx.model` (.currentUser), events: formValuesChange, beforeRender, afterSubmit

## Menu Structure

Use `nb_create_menu` for the simplest approach:

```
nb_create_menu("Asset Management", top_group_id,
    '[["Asset Ledger","databaseoutlined"],["Purchases","shoppingcartoutlined"]]',
    group_icon="bankoutlined")
```

This creates a group + pages in one call, returning `{"Asset Ledger": "tab_uid_1", "Purchases": "tab_uid_2"}`.

## Verify & Debug — Three-Level Drill-Down

```
nb_inspect_all("CRM")            — system overview (~1 line per page, default)
nb_inspect_all("CRM", depth=1)   — full structure of every page

nb_inspect_page("Customer List")  — single page: forms, columns, popups
                                    [JS 1200c] [2 events] sort: field desc (drawer,large)

nb_read_node(uid, "events")      — deep-dive: JS code, event flows, linkage rules
nb_read_node(uid, "js")
nb_read_node(uid, "linkage")
```

**Workflow: Debug → Locate → Fix**
1. `nb_inspect_page` — find the problem area
2. `nb_read_node(uid, "events")` — see the actual code
3. `nb_inject_js` / `nb_patch_field` — fix it

## Page Modification & Debugging

```
# 1. Overview — understand the page structure
nb_inspect_page("Page Title")

# 2. Find — locate a specific node
nb_locate_node("Page Title", field="status")  # returns UID
nb_locate_node("Page Title", block="addnew")  # find AddNew form

# 3. Debug — read node configuration
nb_read_node(uid, "events")     # event flow JS code
nb_read_node(uid, "js")         # JS block/column code
nb_read_node(uid, "linkage")    # button linkage rules

# 4. Fix — modify the node
nb_patch_field(uid, '{"required":true}')
nb_patch_column(column_uid, '{"width":120}')
nb_add_column(table_uid, collection, "new_field")
nb_remove_column(column_uid)
nb_inject_js(uid, code)         # replace JS code
```

## Detail Popup (Auto-Generated by Default)

**You usually DON'T need to specify `<detail>`.** When omitted in table markup,
a "Details" tab is auto-generated from the edit form's field layout (same fields, same
dividers, minus required markers).

Only specify `<detail>` when you need:
- Sub-table tabs (e.g., customer → contacts, orders)
- JS items or custom layout inside the popup
- A different field layout from the edit form

```xml
<detail>
  <tab title="Info" fields="name|code\nstatus" />
  <tab title="Tasks">
    <subtable collection="nb_pm_tasks" assoc="tasks" fields="name,status,createdAt" />
  </tab>
</detail>
```

## Ant Design Icons
Common icons for menus: `homeoutlined`, `settingoutlined`, `databaseoutlined`,
`shoppingcartoutlined`, `bankoutlined`, `tooloutlined`, `formoutlined`,
`barchartoutlined`, `piechartoutlined`, `idcardoutlined`, `caroutlined`,
`containeroutlined`, `clusteroutlined`, `apartmentoutlined`, `environmentoutlined`,
`shopoutlined`, `controloutlined`, `appstoreoutlined`, `inboxoutlined`,
`deleteoutlined`, `swapoutlined`, `sendoutlined`
