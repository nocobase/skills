---
name: nocobase-dsl-reconciler
description: >-
  Build NocoBase applications from YAML + JS specs.
  Trigger: user wants to build, create, export, or replicate a NocoBase system/module.
---

# NocoBase Application Builder

## How to Respond

| User says | Do this |
|-----------|---------|
| "Build me a XXX system" | **Build Mode** → design → confirm → build in rounds |
| "Modify / add a field" | Edit structure.yaml → `python deployer.py dir/ --force` |
| "Export pages" | `python exporter.py "Page" outdir/` |

## Build Mode

### Step 1 — Design (show plan, ask to confirm)

```
Module: Helpdesk
Pages: Dashboard, Tickets, Users, SLA Configs, Knowledge Base

Collections:
  nb_helpdesk_tickets: title, description, priority(P0-P3), status, assignee(m2o), ...
  nb_helpdesk_users: name, email, role(admin/agent/user), ...

Dashboard: 4 KPI cards + 5 charts
Each page: search filter + table + addNew/edit/detail popups

Shall I start building?
```

### Step 2 — Build in Rounds

| Round | What | Verify |
|-------|------|--------|
| 1 | Write structure.yaml → `python deployer.py dir/` | Pages appear in sidebar |
| 2 | Insert test data (5-8 records per table) | Tables show data |
| 3 | Write enhance.yaml → `python deployer.py dir/ --force` | Popups work |

Report each round result. Ask before continuing.

### Step 3 — Dashboard KPI + Charts

Dashboard page auto-scaffolds 4 KPI cards + 5 charts. Edit:
- `js/kpi_*.js` — change CONFIG.label and CONFIG.sql
- `charts/chart_*.sql` — change SQL query
- `charts/chart_*_render.js` — change ECharts option

See `templates/kpi_card.js` for KPI template. See `examples/crm/analytics/` for chart examples.

## Commands

```bash
cd tools

# Scaffold new module (Dashboard auto-generated with KPI + charts)
python deployer.py --new ../myapp "My App" --pages "Dashboard,Orders,Products"

# Deploy
python deployer.py ../myapp/

# Force update after edits
python deployer.py ../myapp/ --force

# Preview only
python deployer.py ../myapp/ --plan

# Export existing page
python exporter.py "Leads" ../export/leads/

# Export all pages
python exporter.py --all ../export/
```

## structure.yaml Template

```yaml
module: My Module
icon: fundoutlined

collections:
  nb_mymod_items:
    title: Items
    fields:
    - name: name
      interface: input
      title: Name
    - name: status
      interface: select
      title: Status
      options: [Active, Inactive]
    - name: category
      interface: m2o
      title: Category
      target: nb_mymod_categories

pages:
- page: Dashboard
  icon: dashboardoutlined
  blocks: []  # auto-filled by scaffold

- page: Items
  icon: fileoutlined
  coll: nb_mymod_items
  blocks:
  - key: filterForm
    type: filterForm
    coll: nb_mymod_items
    fields:
    - field: name
      filterPaths: [name]
    - status
  - key: table
    type: table
    coll: nb_mymod_items
    fields: [name, status, category, createdAt]
    actions: [filter, refresh, addNew]
    recordActions: [edit, delete]
  layout:
  - - filterForm
  - - table
```

## enhance.yaml Template

```yaml
popups:
- target: $items.table.actions.addNew
  auto: [edit, detail]
  view_field: name
  coll: nb_mymod_items
  blocks:
  - key: form
    type: createForm
    resource:
      binding: currentCollection
    fields: [name, status, category, description]
    field_layout:
    - '--- Basic Info ---'
    - - name
      - status
    - - category
    - - description
    actions: [submit]
```

## Key Rules

1. **Design first** — never build without user confirmation
2. **filterForm** — max 3 fields: 1 search (with filterPaths) + 1-2 select/date
3. **auto: [edit, detail]** — auto-derives edit + detail popups from addNew form
4. **Incremental** — always `--force` update, never destroy + recreate
5. **Validate** — deployer checks fields, tables, SQL before any API calls

## Examples

See `examples/crm/` — complete 16-page CRM with dashboards, charts, KPI cards, nested popups.
