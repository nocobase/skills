---
name: nocobase-app-builder
description: Orchestrator skill for building complete NocoBase business applications. Guides the agent through phases, directing to the correct skill at each step.
---

# nocobase-app-builder

Build complete NocoBase business applications by following a phased workflow. Each phase uses a different specialized skill.

## When to trigger

- "Build me a CRM / HRM / WMS / project management system"
- Any request to build a complete NocoBase application with multiple tables and pages

## Workflow

```
Phase 1: Install & Connect     →  nocobase-install-start + nocobase-mcp-setup
Phase 2: Data Modeling          →  nocobase-data-modeling
Phase 3: Page Building          →  nocobase-page-builder
Phase 4: Workflows (optional)   →  nocobase-workflow-manage
Phase 5: Permissions (optional) →  nocobase-acl-manage
```

### Phase 1: Install & Connect

Skip if NocoBase is already running.

- **Skill**: `nocobase-install-start` — Install and start NocoBase (Docker / create-nocobase-app / git)
- **Skill**: `nocobase-mcp-setup` — Configure MCP connection for your agent CLI

### Phase 2: Data Modeling

Create all collections, fields, and relations BEFORE building any pages.

- **Skill**: `nocobase-data-modeling`
- **Key reference**: `nocobase-data-modeling/references/collection-types/` for field creation examples
- **Output**: All tables with correct fields, relations (m2o/o2m/m2m), and titleField set
- **Verify**: Each collection has all expected fields via API

**Critical for m2o relations** — use the correct format from `nocobase-data-modeling` skill:
```json
{
  "interface": "m2o",
  "type": "belongsTo",
  "name": "department",
  "foreignKey": "departmentId",
  "target": "hr_departments",
  "onDelete": "SET NULL",
  "uiSchema": {
    "title": "Department",
    "x-component": "AssociationField",
    "x-component-props": {
      "multiple": false,
      "fieldNames": { "label": "name", "value": "id" }
    }
  }
}
```

After creating all fields: `POST /api/app:restart` to refresh metadata cache.

### Phase 3: Page Building

Build all pages, forms, detail popups, JS blocks, and charts.

- **Skill**: `nocobase-page-builder`
- **Method**: `pip install -e skills/nocobase-page-builder/mcp-server/`, write Python scripts
- **Key tools**: `nb.menu()`, `PageMarkupParser.parse()`, `nb.save_nested()`, `nb.auto_js()`, `nb.chart()`
- **Forms**: MUST use `<section>/<row>/<field>` XML children for grouping
- **JS columns**: Only for logic-driven rendering (multi-field composite, conditional formatting, computed values) — NOT for simple field display
- **Charts**: `nb.chart(grid, sql, option_js)` — use PostgreSQL SQL, `ctx.data.objects`, `var`, `function(){}`, `return {...}`

### Phase 4: Workflows (optional)

Automate business logic: auto-numbering, status sync, reminders, approval flows.

- **Skill**: `nocobase-workflow-manage`

### Phase 5: Permissions (optional)

Configure role-based access control.

- **Skill**: `nocobase-acl-manage`

## Phase transitions

| From → To | When to move | What to verify |
|-----------|-------------|----------------|
| 2 → 3 | All collections + fields created | `nb.fields(coll)` shows all expected fields |
| 3 → 4 | All pages built + JS injected | Pages render correctly in browser |
| 3 → 5 | Pages ready for production | Basic functionality verified |

## Common mistakes

| Mistake | Consequence | Prevention |
|---------|-------------|------------|
| Build pages before fields exist | Missing columns, empty forms | Always complete Phase 2 first |
| m2o `fieldNames` as array | RecordSelectFieldModel crash | Use `{"label":"name","value":"id"}` object format |
| Skip `app:restart` after field creation | Frontend can't find new fields | Always restart after Phase 2 |
| JS columns for native fields | Unnecessary complexity | Only JS for multi-field/logic-driven display |
| Arrow functions in chart option | Chart won't render | Use `function(){}` syntax |
| `ctx.data` in chart option | No data | Use `ctx.data.objects` |
