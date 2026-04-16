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
4. Insert test data (see `templates/seed.sh`)

**Warning: routes.yaml `title` must match the pages/ directory name** (lowercase).
e.g. `title: Projects` → `pages/myapp/projects/layout.yaml`

### Round 2: Popups + Details

Edit popup/block templates → `deploy --force`

### Round 3: JS + Charts (optional)

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

## Field Type Reference

| interface | Purpose | Required params |
|-----------|---------|-----------------|
| input | Short text | — |
| textarea | Long text | — |
| select | Dropdown | `options: [{value, label}]` |
| number | Decimal | — |
| integer | Integer | — |
| dateOnly | Date | — |
| datetime | Date + time | — |
| m2o | Many-to-one | `target: collection_name` |
| o2m | One-to-many | `target: collection_name` |
| email | Email | — |
| phone | Phone | — |
| percent | Percentage | — |
| checkbox | Boolean | — |

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

# Export
npx tsx cli/cli.ts export-project "MyApp" /tmp/export
```
