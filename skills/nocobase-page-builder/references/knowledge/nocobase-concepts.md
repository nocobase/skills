# NocoBase Core Concepts

## What is NocoBase?

NocoBase is an open-source no-code/low-code platform. You build business systems by:
1. Creating **Collections** (data tables with fields and relations)
2. Building **Pages** (UI composed of blocks — tables, forms, details, charts)
3. Adding **Workflows** (automation triggered by data events)
4. Configuring **AI Employees** (chat assistants with access to system data)

Everything is stored as configuration, not code. The MCP tools let you programmatically configure NocoBase.

---

## Collections & Fields

A **Collection** = a database table + metadata (field types, relations, UI hints).

```
nb_setup_collection("nb_crm_customers", "Customers",
    field_interfaces={"name": "input", "status": "select", "phone": "phone"},
    relations=[{"field": "contacts", "type": "o2m", "target": "nb_crm_contacts", "foreign_key": "customer_id"}])
```

### Field Interfaces (common)

| Interface | Renders as | Example |
|-----------|-----------|---------|
| input | Text input | name, code, title |
| textarea | Multi-line text | description, remarks |
| integer / number | Number input | quantity, amount |
| select | Dropdown (single) | status, grade, type |
| multipleSelect | Dropdown (multi) | tags |
| date / datetime | Date picker | start_date, createdAt |
| phone / email / url | Specialized input | phone, email |
| percent | Percentage | probability, rate |
| m2o | Many-to-one relation | customer (on contact) |
| o2m | One-to-many relation | contacts (on customer) |

### Relations

| Type | Meaning | Example |
|------|---------|---------|
| m2o | This record belongs to one parent | contact.customer → customers |
| o2m | This record has many children | customer.contacts → contacts |
| m2m | Many-to-many via junction table | product.categories |

**Critical**: o2m relations on the parent are required for detail popup subtables.

### System Fields (auto-created, never in DDL)

`id`, `createdAt`, `updatedAt`, `createdById`, `updatedById`, `createdBy`, `updatedBy`

---

## Pages & FlowModel

NocoBase pages are trees of **FlowModel** nodes. Each node has a `use` (model type) and `stepParams` (configuration).

### Page Structure

```
Route (menu entry)
  └─ RootPageModel (page container)
       └─ TabPageModel (tab — content root)
            └─ BlockGridModel (layout grid)
                 ├─ TableBlockModel (data table)
                 │    ├─ TableColumnModel (columns)
                 │    ├─ AddNewActionModel (add button → form popup)
                 │    └─ EditActionModel (edit button → form popup)
                 ├─ FilterFormModel (search bar)
                 ├─ JSBlockModel (custom visualization)
                 └─ KPIBlockModel (single number stat)
```

### How Pages Are Built

**XML Markup** (what agents write):
```xml
<page collection="nb_crm_customers">
  <row>
    <kpi title="Total" />
    <kpi title="Active" filter="status=active" color="blue" />
  </row>
  <filter fields="name,status,industry" target="tbl" />
  <row>
    <table id="tbl" span="16" fields="name,status,phone,createdAt">
      <js-col type="composite" field="name" subs="city,source" title="Customer">
        Bold name, gray subtitle showing city and source
      </js-col>
    </table>
    <stack span="8">
      <js-block title="Industry Distribution">Bar chart by industry</js-block>
    </stack>
  </row>
</page>
```

`nb_page_markup(tab_uid, xml)` parses this XML and creates the full FlowModel tree.

### Key Concept: JS Placeholders

XML creates **placeholder** JS blocks/columns. They need real code injected later:
1. `nb_auto_js(prefix)` — auto-generates code for columns (composite, currency, etc.) and common patterns
2. `nb_find_placeholders(scope)` — lists remaining placeholders
3. `nb_inject_js(uid, code)` — replaces one placeholder with real code

### Detail Popups

Clicking a table row opens a detail popup. Structure:
```
ChildPageModel (popup)
  ├─ Tab "Basic Info" → DetailsBlockModel (fields) + JSItemModel (visual summary)
  ├─ Tab "Contacts"  → TableBlockModel (subtable, needs association!)
  └─ Tab "History"   → TableBlockModel (subtable)
```

Subtables MUST have `association` = `parentCollection.relationField`.

### Forms

- **AddNew form**: popup when clicking "Add" button
- **Edit form**: popup when clicking "Edit" action
- Forms auto-generate with all editable fields
- Refine with `nb_set_form(table_uid, type, fields_dsl)` for sections and layout

---

## JS Sandbox

Custom JS runs in a sandboxed environment with:

| Object | Purpose | Available in |
|--------|---------|-------------|
| `ctx.React` | React.createElement | All JS types |
| `ctx.antd` | Ant Design 5 components | All JS types |
| `ctx.api` | HTTP client for data fetching | Blocks, columns |
| `ctx.render(el)` | Render output (call once) | Blocks, columns, items |
| `ctx.record` | Current row data | Columns, items |
| `ctx.form` | Form instance | Events only |

### API Request Pattern
```javascript
const r = await ctx.api.request({
  url: 'nb_crm_customers:list',
  params: { paginate: false }
});
const items = r?.data?.data || [];
```

### Code Rules
1. Always: `const h = ctx.React.createElement;`
2. Async blocks: `(async () => { ... })();`
3. No external imports — only ctx.React, ctx.antd, ctx.api
4. No Card wrapper — NocoBase already wraps blocks in cards
5. `ctx.render()` exactly once

---

## Workflows

Automation triggered by data events.

| Trigger | When | Use Case |
|---------|------|----------|
| collection (create) | New record created | Auto-number, default values |
| collection (update) | Record updated | Status sync, notifications |
| schedule (cron) | Periodic timer | Reports, cleanup |
| action | Manual button click | Approval, export |

### Common Pattern: Auto-Number
```
Trigger: on create "nb_crm_customers"
  → Query: count existing records
  → Calculation: format "CU-" + padded count
  → Update: set customer_no field
```

---

## AI Employees

Chat assistants embedded in the system. They can:
- Answer questions about data
- Execute actions on behalf of users
- Be placed on specific pages as shortcuts

Created via `nb_create_ai_employee(username, nickname, bio, ...)`.

---

## Menu Structure

```
Top Group (e.g. "CRM")
  ├─ Sub-Group "Customer Mgmt"
  │    ├─ Page "Customers"
  │    └─ Page "Contacts"
  ├─ Sub-Group "Sales"
  │    ├─ Page "Leads"
  │    └─ Page "Opportunities"
  └─ ...
```

Groups are folders (no content). Pages have content.
Always create a top-level group first, then sub-groups with pages.

---

## Debugging

| Tool | What it shows |
|------|--------------|
| `nb_inspect_all(prefix)` | All pages summary — block counts, JS counts |
| `nb_page_map(tab_uid)` | Visual HTML map with UIDs for one page |
| `nb_fields(collection)` | All fields with types and interfaces |
| `nb_find_placeholders(scope)` | Unimplemented JS placeholders |

## Common Pitfalls

1. **Subtable "Cannot read collection"** — missing `association` on TableBlockModel
2. **Empty detail popup** — `enableTabs` not set on ChildPageModel
3. **JS not rendering** — forgot `ctx.render()` or used backticks in code string
4. **Form event not firing** — event attached to ActionModel instead of FormModel
5. **System columns in DDL** — causes field conflicts (created_at vs createdAt)
