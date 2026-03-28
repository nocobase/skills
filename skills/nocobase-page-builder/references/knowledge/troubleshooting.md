---
name: nocobase-troubleshooting
description: Debug common page building issues — detail popups, subtables, associations, JS items
triggers:
  - error
  - Cannot read
  - error
  - debug
  - troubleshoot
  - subtable
  - association
  - detail
tools:
  - nb_inspect_page
  - nb_inspect_all
  - nb_read_node
  - nb_find_placeholders
  - nb_list_fields
---

# NocoBase Page Troubleshooting Guide

## Quick Diagnostic Flow

```
Page error?
  ├── "Cannot read properties of undefined (reading 'collection')"
  │   → Subtable association missing → see §1
  ├── Detail popup is blank
  │   → ChildPageModel structure issue → see §2
  ├── JS placeholder not taking effect
  │   → inject_js injection issue → see §3
  ├── Form event not firing
  │   → flowRegistry structure issue → see §4
  └── Field not showing / extra fields
      → Field name mismatch → see §5
```

---

## §1 Subtable Association Error

### Symptoms
```
Cannot read properties of undefined (reading 'collection')
```
Commonly seen in: associated subtable tabs in detail popups (e.g., "Contacts", "Related Opportunities")

### Root Cause
The subtable TableBlockModel's `resourceSettings.init` is missing the `association` field.

### Troubleshooting Steps

1. **Locate the subtable node UID**
```
nb_inspect_page(tab_uid)
→ Find the TableBlockModel under the detail popup
→ Note the UID
```

2. **Read the node to confirm**
```
nb_read_node(uid, "resource")
→ Check resourceSettings.init:
   ✓ collectionName = "nb_crm_contacts"      (present)
   ✗ association = "nb_crm_customers.contacts" (missing!)
```

3. **Check whether the o2m relation exists**
```
nb_list_fields("nb_crm_customers")
→ Search for fields with interface=o2m
→ Should have contacts / opportunities / contracts
```

### Fix

**Case A: o2m relation does not exist**
```
nb_setup_collection("nb_crm_customers", "Customers",
  relations_json='[{"field":"contacts","type":"o2m","target":"nb_crm_contacts","foreign_key":"customer_id"}]')
```

**Case B: association field is missing**

Use nb_read_node to read the full node → add the association → save with nb_update_node.

Or rebuild the detail popup page, ensuring the `<subtable>` in XML markup has the `assoc` attribute:
```xml
<subtable collection="nb_crm_contacts" assoc="contacts" fields="name,phone,position" />
```

### Prevention

The `<subtable>` in XML markup **must provide all three**:
- `collection` — subtable collection name
- `assoc` — o2m relation field name on the parent table
- `fields` — list of fields to display in the subtable

---

## §2 Detail Popup Structure

### Correct Node Hierarchy

```
TableBlockModel (main table)
  └─ TableColumnModel (first column, with popupSettings)
       └─ ChildPageModel (detail popup root node)
            ├─ ChildPageTabModel (tab 1)
            │    └─ BlockGridModel
            │         ├─ DetailsBlockModel (field details)
            │         │    └─ DetailGridModel → DisplayFieldModel...
            │         ├─ JSBlockModel (JS visualization block)
            │         ├─ JSItemModel (JS form item)
            │         └─ TableBlockModel (associated subtable)
            │              ↑ must have association!
            └─ ChildPageTabModel (tab 2)
                 └─ ...
```

### Key Properties

| Node | Key stepParams | Description |
|------|----------------|-------------|
| ChildPageModel | `enableTabs: true` | Must be enabled for multiple tabs |
| TableColumnModel (first column) | `popupSettings.openView` | Controls how the popup opens |
| DetailsBlockModel | `resourceSettings.init.collectionName` | Which collection to read |
| DetailsBlockModel | `resourceSettings.init.filterByTk` | `{{ ctx.view.inputArgs.filterByTk }}` |
| TableBlockModel (subtable) | `resourceSettings.init.association` | `{parentColl}.{assocField}` |
| TableBlockModel (subtable) | `resourceSettings.init.sourceId` | `{{ ctx.view.inputArgs.filterByTk }}` |

### XML Markup Detail Popup Example

```xml
<detail>
  <!-- Tab 1: Field details + JS visualization -->
  <tab title="Basic Info" fields="name|code\nstatus|industry">
    <js-item title="Status Timeline">
      Shows the status change history from creation to current state
    </js-item>
  </tab>

  <!-- Tab 2: Associated subtable -->
  <tab title="Contacts">
    <subtable collection="nb_crm_contacts" assoc="contacts" fields="name,phone,position" />
  </tab>

  <!-- Tab 3: JS visualization dashboard -->
  <tab title="Statistics">
    <js-block title="Payment Progress">
      Ring progress bar showing received/total contract amount ratio
    </js-block>
    <js-block title="Follow-up Timeline">
      Timeline displaying follow-up records in reverse chronological order
    </js-block>
  </tab>
</detail>
```

---

## §3 JS Placeholder Issues

### Placeholder Not Replaced

```
nb_find_placeholders("CRM")
→ Check which __placeholder__ entries are still unimplemented
→ For each: nb_inject_js(uid, code)
```

### inject_js Returns Success but Page Still Shows Placeholder

Possible causes:
- Browser cache → force refresh (Ctrl+Shift+R)
- Injected wrong UID → `nb_read_node(uid, "js")` to confirm code was updated

### JS Code Execution Error

```
nb_read_node(uid, "js")
→ Check code syntax
→ Common issues:
   - ctx.record may be undefined in table context → use ctx.record || {}
   - Missing catch in (async () => { ... })() → white screen
   - createElement typo → const h = ctx.React.createElement
```

---

## §4 Event Flow Issues

### Event Not Firing

Check flowRegistry structure:
```
nb_read_node(form_uid, "flow")
→ flowRegistry should have:
   {
     "randomKey": {
       "on": { "eventName": "formValuesChange" },
       "steps": {
         "randomKey": {
           "use": "RunScript",
           "defaultParams": { "code": "..." }
         }
       }
     }
   }
```

Key points:
- eventName must be exact: `formValuesChange` / `beforeRender` / `afterSuccess`
- Events are attached to **CreateFormModel / EditFormModel**, not ActionModel
- In XML, `<event>` must be placed inside `<addnew>` or `<edit>`

### Common eventNames

| Event | When Triggered | Typical Use |
|-------|---------------|-------------|
| `formValuesChange` | Form field value changes | Auto-calculate, cascade select, probability mapping |
| `beforeRender` | Before form renders | Auto-fill defaults (date, serial number) |
| `afterSuccess` | After form submit succeeds | Refresh list, show notification |

---

## §5 Field Not Showing

### Troubleshooting

```
nb_list_fields("nb_crm_customers")
→ Confirm field name spelling (Python snake_case)
→ NocoBase uses camelCase: customer_id → customerId
   but snake_case fields from DDL retain their original names after sync
```

### Common Causes

- DDL has `customer_name` but XML uses `customerName`
- Field exists in DDL but `nb_sync_fields()` was not run
- Relation field (m2o) shows empty → check if the FK column in DB has data
- System fields (createdAt) are always available, no need to declare in DDL

---

## Source Code Navigation Index

### Layer Architecture

```
XML Markup (written by agent)
    ↓ parse()
markup_parser.py          Parse XML → TreeNode tree
    ↓ calls
tree_builder.py           Build TreeNode (FlowModel in-memory objects)
    ↓ save_nested()
client.py                 Serialize → API calls
    ↓ POST
NocoBase flowModels:save  Persist to database
```

### Key Source Files

| File | Line | Method | Responsibility |
|------|------|--------|----------------|
| `markup_parser.py` | 50 | `parse()` | XML parse entry point |
| `markup_parser.py` | 60 | after `_sanitize_markup()` | Escape `<` `&` and other special chars |
| `markup_parser.py` | 193 | `_parse_element()` → table | Handle `<table>` and child elements |
| `markup_parser.py` | 217 | `_parse_element()` → detail | Handle `<detail>` |
| `markup_parser.py` | 298 | `_parse_detail()` | Parse detail popup tabs |
| `markup_parser.py` | 327 | `_parse_detail()` → js-item | JS items inside tabs |
| `markup_parser.py` | 366 | `_parse_events()` | Parse `<event>` and attach to form |
| | | | |
| `tree_builder.py` | 785 | `placeholder_js_item()` | JS item placeholder |
| `tree_builder.py` | 770 | `placeholder_js_block()` | JS block placeholder |
| `tree_builder.py` | 755 | `placeholder_js_col()` | JS column placeholder |
| `tree_builder.py` | 800 | `placeholder_event()` | Event flow placeholder |
| `tree_builder.py` | 824 | `addnew_form()` | Add-new form subtree |
| `tree_builder.py` | 852 | `edit_action()` | Edit form subtree |
| `tree_builder.py` | 885 | `_build_tab_blocks()` | Detail tab content building |
| `tree_builder.py` | 965 | `_sub_table_node()` | Associated subtable (with association) |
| `tree_builder.py` | 1034 | `detail_popup()` | Detail popup entry point |
| | | | |
| `client.py` | 648 | `save_nested()` | Save entire tree in one call |
| `client.py` | 1608 | `find_placeholders()` | Discover placeholders |
| `client.py` | 1741 | `inject_js()` | Inject JS code |
| `client.py` | 1757 | `inject_event()` | Inject event code |
| | | | |
| `models.py` | 13 | `DISPLAY_MAP` | Detail field type mapping |
| `models.py` | 50 | `EDIT_MAP` | Edit field type mapping |
| `models.py` | 188 | JSItemModel | JS form/detail item |

### Detail Popup Data Flow

```
XML:  <detail>
        <tab title="Info" fields="name|code">
          <js-item title="Timeline">Description</js-item>
        </tab>
        <tab title="Contacts">
          <subtable collection="nb_crm_contacts" assoc="contacts" fields="name,phone" />
        </tab>
      </detail>

      ↓ markup_parser._parse_detail()        [L298]

tabs = [
  {"title":"Info", "blocks": [
    {"type":"details", "fields":"name|code"},
    {"type":"js", "title":"Timeline", "code":"<placeholder>"}
  ]},
  {"title":"Contacts", "blocks": [
    {"type":"sub_table", "assoc":"contacts", "coll":"nb_crm_contacts", "fields":["name","phone"]}
  ]}
]

      ↓ tree_builder.detail_popup(coll, tabs)  [L1034]

ChildPageModel
  ├─ ChildPageTabModel("Info")
  │    └─ BlockGridModel
  │         ├─ DetailsBlockModel       ← _build_tab_blocks L900
  │         │    └─ detail_grid()
  │         └─ JSBlockModel            ← _build_tab_blocks L911
  └─ ChildPageTabModel("Contacts")
       └─ BlockGridModel
            └─ TableBlockModel         ← _build_tab_blocks L919 → _sub_table_node L965
                 resourceSettings.init:
                   collectionName: "nb_crm_contacts"
                   association: "nb_crm_customers.contacts"    ← Critical!
                   sourceId: "{{ctx.view.inputArgs.filterByTk}}"
```

---

## Detail Page JS Enhancement Guide

### Available JS Node Types

| Type | Model | Location | Context | Example Use |
|------|-------|----------|---------|-------------|
| JS Column | JSColumnModel | Table column | `ctx.record` = current row | Composite column, currency format, countdown |
| JS Block | JSBlockModel | Page block / inside detail tab | `ctx.model` = current block | Charts, stat cards, funnel |
| JS Item | JSItemModel | Inside form / detail | `ctx.model` = current form | Timeline, progress indicator, tips |
| Event | flowRegistry | CreateForm / EditForm | `ctx.form` = form instance | Auto-calculate, cascade, validation |

### JS Item Characteristics (detail/form context)

JS Items inherently have form object context:
```js
// In detail page, can access the current record
const record = ctx.model?.record || {};
const h = ctx.React.createElement;

// Example: show status change timeline
const steps = [
  { label: 'Created', time: record.createdAt, done: true },
  { label: 'Following Up', time: record.follow_date, done: record.status !== 'new' },
  { label: 'Signed', time: record.sign_date, done: record.status === 'signed' },
];
ctx.render(h('div', { style: { padding: 8 } },
  steps.map((s, i) => h('div', { key: i, style: { display: 'flex', gap: 8, opacity: s.done ? 1 : 0.4 } },
    h('span', { style: { color: s.done ? '#52c41a' : '#d9d9d9' } }, s.done ? '\u25cf' : '\u25cb'),
    h('span', null, s.label),
    s.time && h('span', { style: { color: '#8c8c8c', fontSize: 12 } }, new Date(s.time).toLocaleDateString())
  ))
));
```

### Rich Detail Page Content Suggestions

#### Customer Details
```xml
<detail>
  <tab title="Basic Info" fields="name|code\nstatus|grade\nindustry|city">
    <js-item title="Customer Profile">
      Show grade tags (A/B/C/D colored), industry tags, days since creation, days since last follow-up
    </js-item>
  </tab>
  <tab title="Contacts">
    <subtable collection="nb_crm_contacts" assoc="contacts" fields="name,phone,position,is_primary" />
  </tab>
  <tab title="Opportunities">
    <subtable collection="nb_crm_opportunities" assoc="opportunities" fields="title,stage,amount,probability" />
    <js-block title="Opportunity Funnel">Aggregate amount by stage, horizontal bar chart</js-block>
  </tab>
  <tab title="Follow-up Records">
    <subtable collection="nb_crm_activities" assoc="activities" fields="follow_type,content,follow_date" />
    <js-item title="Recent Activity">
      Timeline showing last 5 follow-up records with type icon + content summary + relative time
    </js-item>
  </tab>
</detail>
```

#### Contract Details
```xml
<detail>
  <tab title="Contract Info" fields="title|contract_code\nstatus|amount\nstart_date|end_date">
    <js-item title="Payment Progress">
      Progress bar showing received/total contract amount ratio, with each payment time and amount listed below
    </js-item>
    <js-item title="Expiry Reminder">
      Large text showing remaining days, orange within 30 days, red flashing when expired
    </js-item>
  </tab>
  <tab title="Contract Line Items">
    <subtable collection="nb_crm_contract_items" assoc="contract_items" fields="product_name,quantity,unit_price,subtotal" />
  </tab>
  <tab title="Payment Records">
    <subtable collection="nb_crm_payments" assoc="payments" fields="payment_code,amount,payment_date,status" />
  </tab>
</detail>
```

---

## Relation Verification Checklist

Before building a detail page with subtables, verify each item:

- [ ] The m2o relation on the subtable collection is established (e.g., `contacts.customer` → `nb_crm_customers`)
- [ ] The o2m relation on the parent collection is established (e.g., `customers.contacts` → `nb_crm_contacts`)
- [ ] `nb_list_fields(parent_collection)` shows the o2m field
- [ ] The `assoc` attribute on `<subtable>` in XML = the o2m field name on the parent table
- [ ] The `assoc` field name uses the relation name (e.g., `contacts`), not the foreign key name (not `customer_id`)
