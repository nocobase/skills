---
name: nocobase-dsl-reconciler
description: >-
  Build NocoBase applications from YAML DSL + JS specs.
  Trigger: user wants to build, create, scaffold, or deploy a NocoBase system/module.
argument-hint: "[system-name]"
allowed-tools: shell, local file reads, local file writes
---

# NocoBase Application Builder

## Environment

```bash
# All commands run from src/
cd <skill-dir>/src

# Environment variables
export NB_USER=admin@nocobase.com NB_PASSWORD=admin123 NB_URL=http://localhost:14000
```

## Build Workflow

### Round 0: Design (must confirm first)

List collections, fields, and relationships. Wait for user confirmation before proceeding. Refer to the `nocobase-data-modeling` skill for data modeling details.

### Round 1: Create Files + Deploy

1. Create working directory `/tmp/myapp/`
2. Write files following the structure in `templates/crm/` (full reference below)
3. Deploy: `npx tsx cli/cli.ts deploy-project /tmp/myapp --group "MyApp" --force`

**Warning: routes.yaml `title` must match the pages/ directory name** (lowercase).
e.g. `title: Projects` → `pages/myapp/projects/layout.yaml`

### Round 2: Test Data + Verification

1. Insert test data: `npx tsx cli/cli.ts seed /tmp/myapp`
   (or manually via API — but use real IDs from GET responses, NOT 1/2/3)
2. Verify data integrity: `npx tsx cli/cli.ts verify-data /tmp/myapp`
   Checks: record completeness, FK references, select values

### Round 3: Popups + Details

Edit popup/block templates → `deploy --force`

### Round 4: JS + Charts (optional)

Copy JS files from `templates/crm/js/` and modify — do not write from scratch.

## Reference Files

| What you need | Where to look |
|---------------|---------------|
| Full project structure | `templates/crm/` — 20+ page CRM |
| Collection field syntax | `templates/crm/collections/*.yaml` |
| Page layout syntax | `templates/crm/pages/main/*/layout.yaml` |
| Block template syntax | `templates/crm/templates/block/*.yaml` |
| Popup template syntax | `templates/crm/templates/popup/*.yaml` |
| routes.yaml | `templates/crm/routes.yaml` |
| defaults.yaml | `templates/crm/defaults.yaml` |
| KPI / chart JS | `templates/crm/js/analytics_jsBlock_*.js` |
| Filter stats JS | `templates/crm/js/customers_filterForm_*.js` |
| Seed data script | `templates/seed.sh` |
| Field type reference | "Field Type Reference" section below |

## File Structure

```
/tmp/myapp/
├── collections/*.yaml          # Collections
├── templates/block/*.yaml      # Form/detail templates
├── templates/popup/*.yaml      # Popup templates
├── pages/<group>/<page>/
│   ├── layout.yaml             # Page (blocks + layout)
│   ├── js/*.js                 # JS blocks
│   └── popups/*.yaml           # Popup bindings
├── routes.yaml                 # Menu tree
├── defaults.yaml               # m2o auto-popups
└── state.yaml                  # Auto-managed, do not edit manually
```

## Popup File Format

Popup files in `popups/` define what opens when a user clicks an action button.

```yaml
# popups/table.addNew.yaml — opens when clicking "Add New" on table
target: $SELF.table.actions.addNew
blocks:
  - ref: templates/block/form_add_new_nb_pm_projects.yaml

# popups/table.edit.yaml — opens when clicking "Edit" on a row
target: $SELF.table.recordActions.edit
blocks:
  - ref: templates/block/form_edit_nb_pm_projects.yaml
```

The `ref:` reads the template block file and inlines its content. Template block files use:
```yaml
# templates/block/form_add_new_nb_pm_projects.yaml
content:
  key: createForm
  type: createForm
  coll: nb_pm_projects
  fields: [name, status, priority, ...]
  field_layout:
    - '--- Basic Info ---'
    - - name
      - status
```

For clickToOpen on table fields (e.g., click name to open details):
```yaml
fields:
  - field: name
    clickToOpen: true    # NOT popup: true (that syntax was removed)
```

## Field Type Reference

All supported field interfaces are defined in `src/types/spec.ts` (`FieldInterface` type).

For detailed field capabilities, relation rules, and compact payload guidance, see:
`../nocobase-data-modeling/references/field-capabilities.md`

Quick reference for common types used in collection YAML:

| interface | Required params |
|-----------|-----------------|
| input, textarea, email, phone, url | — |
| integer, number, percent, checkbox | — |
| select, multipleSelect, radioGroup | `options: [{value, label}]` |
| dateOnly, datetime, time | — |
| markdown, richText, attachment | — |
| m2o | `target: collection_name` |
| o2m | `target: collection_name`, `foreignKey: field_name` |
| m2m | `target: collection_name`, `through: join_table` |

> System columns (`id`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`) are auto-created — do NOT define them.

## Key Rules

1. **select must have options** — `options: [{value, label}]`
2. **collection must have titleField** — auto-set if a `name` field exists
3. **filterForm search fields must have filterPaths** — `filterPaths: [name]`
4. **field_layout must have sections** — `'--- Section Name ---'`
5. **layout must be declared** — required when there is more than 1 block
6. **actions are auto-populated** — no need to write actions/recordActions
7. **routes title = directory name** — title lowercased must match pages subdirectory name
8. **JS: copy from templates** — copy from `templates/crm/js/` and modify
9. **SQL: two-step pattern** — `ctx.sql.save({uid, sql}) + ctx.sql.runById(uid)`
10. **Parent tables first** — seed data: insert tables without foreign keys first
11. **Do NOT define system columns** — never include `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `id` in collection YAML (auto-created by NocoBase)

## Common Errors

| Error | Fix |
|-------|-----|
| `fields not in collection` | Field names in collection YAML don't match NocoBase |
| `titleField is missing` | Add `titleField: name` to collection YAML |
| Only some pages deployed | routes.yaml title doesn't match pages directory name |
| `filterTargetKey is not defined` | Re-deploy with --force |
| `Request failed 400` | Check field definitions in collection YAML |
| Chart SQL failed | Insert test data first; quote field names e.g. `"createdAt"` |
| `Block references fields not in` | Remove non-existent fields from layout.yaml |
| `string violation` on create | Collection has wrong field types — remove `createdAt`/`updatedAt` from YAML and re-deploy |

## Command Reference

```bash
cd <skill-dir>/src
export NB_USER=admin@nocobase.com NB_PASSWORD=admin123 NB_URL=http://localhost:14000

# Deploy
npx tsx cli/cli.ts deploy-project /tmp/myapp --group "MyApp" --force

# Seed test data (handles FK IDs correctly — no more projectId=1 errors)
npx tsx cli/cli.ts seed /tmp/myapp --count 5

# Verify data integrity (FK references, field completeness)
npx tsx cli/cli.ts verify-data /tmp/myapp

# Export
npx tsx cli/cli.ts export-project "MyApp" /tmp/export
```
