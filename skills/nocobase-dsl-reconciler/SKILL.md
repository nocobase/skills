---
name: nocobase-dsl-reconciler
description: >-
  Use when the user wants to export NocoBase pages to YAML/JS specs,
  deploy pages from specs, sync live changes back, or replicate modules
  across NocoBase instances using a declarative DSL approach.
  Does NOT handle interactive MCP tool calls — that is nocobase-ui-builder.
---

# NocoBase DSL Reconciler

Declarative YAML+JS specs for NocoBase pages. Export from live system, edit specs, deploy to any instance.

## When to Use

- Export existing pages/popups to reusable YAML specs
- Deploy a complete module (pages + popups + JS + layout) from specs
- Sync live UI changes back to spec files
- Replicate a module from one NocoBase instance to another

## Tools

| Tool | Purpose | Command |
|------|---------|---------|
| `exporter.py` | Live system → YAML + JS files | `python exporter.py` (library) |
| `deployer.py` | YAML specs → live NocoBase | `python deployer.py <module_dir>/ [--force]` |
| `sync.py` | Live changes → update specs | `python sync.py <module_dir>/` |
| `split_popups.py` | Split popups into individual files | `python split_popups.py <module_dir>/` |
| `view.py` | Tree view of exported module | `python view.py <module_dir>/` |
| `refs.py` | List available $variable paths | `python refs.py <state.yaml>` |

## Module Directory Structure

```
module/
├── structure.yaml          # Pages: blocks, fields, layout, actions
├── enhance.yaml            # Top-level popups (addNew with auto-derive edit)
├── state.yaml              # UID registry (auto-generated, don't edit)
├── popups/                 # Detail popups (one file per popup)
│   ├── name.yaml                      # L0: table.fields.name click
│   ├── name.details_0.edit.yaml       # L1: details_0 edit action
│   ├── name.quotation_no.yaml         # L1: quotation_no column click
│   ├── name.quotations.addnew.yaml    # L1: quotations addNew action
│   └── name.attachments.edit.yaml     # L1: attachments edit action
├── js/                     # JS code files (referenced by specs)
│   ├── opp_filterForm_0_pipeline_stats_filter_block.js
│   ├── popup_name_tab0_quotations_event_4z3wblmtie1_9ibklmbe1vr.js
│   └── ...
└── charts/                 # Chart config JSON (optional)
```

### Popup File Naming

Dot-separated path reflecting the nesting hierarchy:

```
name.yaml                          # page → name field click popup
name.quotation_no.yaml             # name popup → quotation_no click
name.quotations.addnew.yaml        # name popup → quotations table → addNew
name.details_0.edit.yaml           # name popup → details_0 → edit action
```

Format: `<parent_path>.<block_key>.<action_or_field>.yaml`

## DSL Quick Reference

### structure.yaml — Page Definition

```yaml
module: My Module
icon: fundoutlined
pages:
- page: My Module
  icon: fundoutlined
  coll: my_collection        # default collection for blocks
  blocks:
  - key: filterForm_0
    type: filterForm
    coll: my_collection
    fields:
    - field: name
      filterPaths: [name, department, position]
    - status

  - key: table
    type: table
    coll: my_collection
    fields: [name, amount, status, createdAt]
    actions: [filter, refresh, addNew]
    recordActions: [edit, delete]

  layout:
  - - filterForm_0
  - - table
```

### enhance.yaml — Complete Template

```yaml
# ← Copy this, change collection/fields/page name
popups:
- target: $my_page.table.actions.addNew    # ← $<page_key>.table.actions.addNew
  auto: [edit, detail]                      # auto-derive: edit popup + name-click detail popup
  view_field: name                          # which column click opens detail (default: name)
  coll: my_collection                       # ← your collection name
  blocks:
  - key: form
    type: createForm
    resource:
      binding: currentCollection
    fields:                                 # ← all editable fields
    - name
    - amount
    - status
    - category
    - start_date
    - description
    field_layout:                            # ← group fields with dividers
    - '--- Basic Info ---'
    - - name
      - status
    - - amount
      - category
    - '--- Details ---'
    - - start_date
    - - description
    actions: [submit]
```

### popups/*.yaml — Custom Detail (Round 4 only)

`auto: [detail]` auto-generates basic detail popups. Only write popups/*.yaml when you need custom content (sub-tables, tabs, nested popups). See `examples/crm/popups/` for full examples.

## Block Types

| Type | Model | Use Case |
|------|-------|----------|
| `table` | TableBlockModel | Data table with columns, actions |
| `details` | DetailsBlockModel | Read-only detail view |
| `createForm` | CreateFormModel | New record form |
| `editForm` | EditFormModel | Edit record form |
| `filterForm` | FilterFormBlockModel | Filter panel |
| `comments` | CommentsBlockModel | Comment thread |
| `recordHistory` | RecordHistoryBlockModel | Change history |
| `list` | ListBlockModel | Card list view |
| `reference` | ReferenceBlockModel | Reference to a template block |

## Special Features

### Reference Blocks (Template Reuse)

```yaml
- key: ref_detail
  type: reference
  template_uid: lvqgjptnoio
  template_name: 'Details: Quotations'
  reference_mode: reference    # reference | copy
```

### Field Templates (ReferenceFormGridModel)

Form/detail block whose fields come from a shared template:

```yaml
- key: editForm_0
  type: editForm
  coll: my_collection
  field_template:
    templateUid: 5tpe5cpsnuf
    templateName: 'Form (Add new): Opportunities'
    targetUid: d7e295047ff
    mode: reference
  actions: [submit]
```

### Event Flows (JS on Block Events)

```yaml
- key: table_0
  type: table
  event_flows:
  - event:
      eventName: beforeRender
    flow_key: custom_render
    step_key: runJs
    desc: Custom table render
    file: ./js/table_custom_render.js
```

### Field Layout DSL

```yaml
field_layout:
- '--- Section Title ---'            # divider
- - field_a                           # row with fields
  - field_b
- - '[JS:Widget Name]'               # JS item
- - field_c: 16                       # field with column width (24-grid)
  - field_d: 8
- - col:                              # vertical column group
    - field_e
    - field_f
    size: 12
```

### $Variable References

Spec files use `$page.block.path` to reference UIDs:

```
$my_module.table.actions.addNew     → addNew action UID
$my_module.table.fields.name        → name field UID
$my_module.table.record_actions.edit → edit record action UID
```

Resolved at deploy time via `state.yaml`.

## Workflow — Build a Module in Rounds

A typical module has 5-10 pages. Build in rounds, each round deploy + verify + next round.

### Round 1: Skeleton — All Pages + Tables

Write `structure.yaml` with ALL pages at once. Each page: table + filterForm + actions. No popups yet.

```bash
python deployer.py mymodule/
# Verify: all pages appear in sidebar, tables render with columns
```

### Round 2: Test Data

Insert test data via NocoBase API or UI so tables are not empty. Verify field types render correctly (select shows tags, dates formatted, etc.).

### Round 3: Popups — AddNew + Edit + Detail (auto-generated)

Write `enhance.yaml` only. Use `auto: [edit, detail]` to auto-derive all popups from addNew form:
- `edit` → edit popup with same fields/layout
- `detail` → name-click detail popup with same fields/layout + edit action + createdAt

No need to write `popups/*.yaml` at this stage — deployer generates them automatically.

```yaml
# enhance.yaml
popups:
- target: $my_page.table.actions.addNew
  auto: [edit, detail]     # auto-derive edit + detail from this form
  view_field: name          # which field click opens detail (default: name)
  coll: my_collection
  blocks:
  - key: form
    type: createForm
    ...
```

```bash
python deployer.py mymodule/ --force
# Verify: addNew form opens, edit works, name click shows detail with same layout
```

### Round 4: Detail Enhancement

Refine detail popups: add sub-tables (association), comments, attachments, record history tabs.
Write `popups/*.yaml` only for pages that need custom detail beyond the auto-generated one.

```bash
python deployer.py mymodule/ --force
# Verify: nested tables show data, nested popups open correctly
```

### Round 5: JS Customization

Add JS items: KPI cards, status flow blocks, custom column renderers, event flows.
Write JS files in `js/`, reference from specs.

```bash
python deployer.py mymodule/ --force
# Verify: JS blocks render, event flows trigger
```

### Round 6: Sync + Polish

```bash
python sync.py mymodule/     # capture any manual UI adjustments back to specs
python deployer.py mymodule/ --force  # re-apply to ensure consistency
```

### Replicate Existing Module

```bash
# Export from source system:
python exporter.py   # (library calls to export_page_surface + export_all_popups)

# Deploy to target system:
python deployer.py mymodule/
```

## Key Rules

1. **Never destroy+recreate** — always incremental update, UIDs must be stable
2. **Popup fields first** — table columns with click-to-open popups auto-sort to front
3. **edit/view actions** — created without popup stubs, NocoBase auto-generates form at runtime
4. **Recursive popups** — nested popups auto-loaded from `popups/` by dot-path matching
5. **field_template** — replaces FormGridModel with ReferenceFormGridModel at deploy time
6. **Event flows** — JS code in separate files, only config metadata in YAML

## Example

See [examples/crm/](./examples/crm/) for a complete CRM Opportunities module with:
- Main page: filter + table
- Name detail popup (3 tabs, 7 blocks, nested popups)
- Quotation detail (reference blocks, 3 tabs)
- AddNew popup (reference block form)
- Event flows, JS items, field templates
