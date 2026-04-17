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

1. **Working directory**: use the **path the user gave you**. If they didn't
   give one, ask. Do NOT default to `/tmp/myapp/` — that path is just an
   example below; reusing it overwrites whatever someone else put there.
2. Write files following the structure in `templates/crm/` (full reference below)
3. Deploy: `npx tsx cli/cli.ts push <user-dir> --force`

**Two identifiers, two purposes**: every route has both a `key` (identity)
and a `title` (display).

```yaml
# routes.yaml
- key: it_ops              # ascii slug — drives state.yaml + pages/ dir naming
  title: IT 运维             # display name — can be Chinese, with spaces, anything
  type: group
  children:
    - key: tickets
      title: 工单
```

- `key` is REQUIRED for non-trivial titles. Defaults to `slugify(title)` when
  omitted, so an English title `Projects` gets `key: projects` automatically.
  But a Chinese title `工单` would slugify to a hash-y string — write the key
  explicitly. **Page directories are named after the key** (`pages/it_ops/tickets/`).
- `title` is what NocoBase shows in the menu. Don't translate it — leave the
  user's wording.

**Don't pull in source code.** This skill is a manual. Source files in
`src/`, `workspaces/`, examples in `templates/crm/` are reference material
when something is unclear, but you should not need to grep through `.ts`
files to learn how the DSL works. If you find yourself reading `.ts`,
something in this manual is missing — note what was missing and tell the
user.

### Round 2: Test Data + Verification

1. Insert test data: `npx tsx cli/cli.ts seed /tmp/myapp`
   (or manually via API — but use real IDs from GET responses, NOT 1/2/3)
2. Verify data integrity: `npx tsx cli/cli.ts verify-data /tmp/myapp`
   Checks: record completeness, FK references, select values

### Round 3: Popups + Details

Edit popup/block templates → `deploy --force`

### Round 4: JS + Charts (optional)

Copy JS files from a page's `pages/<group>/<page>/js/` directory in the CRM template and modify — do not write from scratch.

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
| KPI / chart JS | `templates/crm/pages/main/analytics/js/analytics_jsBlock*.js` |
| Filter stats JS | `templates/crm/pages/main/customers/tab_customers/js/customers_customers_filterForm_*.js` |
| Seed data command | `npx tsx cli/cli.ts seed /tmp/myapp` |
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

### Two ways to use a template — pick the right one

**Way A — `key: reference` (use this for shared forms)**

The popup block becomes a *reference* to the template. Edit the template
once, every popup that references it updates. NB tracks usage. This is what
you want for "the same Add/Edit form appears in 5 popups".

```yaml
# popups/table.addNew.yaml
target: $SELF.table.actions.addNew
blocks:
  - ref: templates/block/form_add_new_tickets.yaml
    key: reference                # ← REQUIRED — turns this into a real ref
```

```yaml
# templates/block/form_add_new_tickets.yaml — NO uid needed for fresh templates
name: 'Form (Add new): Tickets'   # ← REQUIRED — the deploy looks up by name
type: block                        # ← REQUIRED
collectionName: it_tickets         # ← REQUIRED for fields validation
content:
  key: createForm
  type: createForm
  coll: it_tickets
  fields: [title, description, urgency, status]
  field_layout:
    - '--- Basics ---'
    - - title
      - status
  actions: [submit]
```

After deploy, check the template `usageCount` is **>= 1**. If still 0, the
ref didn't bind — most often because `key: reference` was forgotten or the
template file is missing the `name`/`type`/`collectionName` header.

**Way B — bare `ref:` (use this only to factor out repeated chunks)**

Without `key: reference`, the template content gets *inlined* into the
popup. Each popup ends up owning its own copy. Useful only when the
"template" is just a tidy way to keep a complex block out of the page file.

```yaml
target: $SELF.table.actions.addNew
blocks:
  - ref: templates/block/form_add_new_tickets.yaml
    # no key: reference → inlined, template usage stays 0
```

### Embedding a child list inside a detail popup

This is *the* canonical "click row to see details + child records" pattern.
Two blocks in the popup: a `details` for the parent record + a `table` for
the o2m children.

```yaml
# popups/table.fields.title.yaml — opens when clicking the title in table
target: $SELF.table.fields.title
mode: drawer
coll: it_tickets
blocks:
  - key: details
    type: details
    coll: it_tickets
    resource_binding:
      filterByTk: '{{ctx.view.inputArgs.filterByTk}}'   # mandatory in popups
    fields: [title, reporter_name, urgency, status, description, assignee, createdAt]
    field_layout:
      - '--- 基本信息 ---'
      - - title
        - status
      - - urgency
        - assignee
      - '--- 描述 ---'
      - - description
  - key: comments
    type: table
    coll: it_comments
    resource_binding:
      sourceId: '{{ctx.view.inputArgs.filterByTk}}'    # bind to parent record
      associationName: ticket.comments                  # parent.assoc field name
    fields:
      - field: content
        ellipsis: true
      - createdBy
      - createdAt
    actions: [addNew]                                   # users can add new comments
layout:
  - - details
  - - comments
```

Key points for the child block:
- `resource_binding.sourceId + associationName` is what scopes the child
  list to the parent record. Without these, you'll see *all* comments, not
  just this ticket's.
- `associationName` format is `<parent_collection_alias>.<o2m_field_name>`.
  In the parent collection's o2m field this is the field name (`comments`).
- The o2m must already be declared on the parent collection
  (`comments: o2m → it_comments, foreignKey: ticket_id`).

### Other popup tricks

```yaml
# clickToOpen on a table field — wires the cell to a popup target
fields:
  - field: title
    clickToOpen: true
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

> **m2o foreign key columns** are auto-created. If you declare `category` (m2o → nb_pos_categories), NocoBase creates `category_id` automatically. **Do NOT** define `category_id` as a separate integer field — it duplicates the auto-FK and corrupts seed data.

## Key Rules

1. **select must have options** — `options: [{value, label}]`
2. **collection must have titleField** — auto-set if a `name` field exists
3. **filterForm search fields must have filterPaths** — `filterPaths: [name]`
4. **field_layout must have sections** — `'--- Section Name ---'`
5. **layout must be declared** — required when there is more than 1 block
6. **actions are auto-populated** — no need to write actions/recordActions
7. **`key` (lower_snake_ascii) is identity, `title` is display** — directories
   under `pages/` are named by `key`, NOT by title. Always set `key` when the
   title is not pure ascii (e.g. Chinese).
8. **Templates: `name` is the link**, `uid` is optional. Fresh templates can omit
   the top-level `uid` — the deploy resolves by name. After first deploy, pull
   will write the assigned uid back so subsequent deploys are stable.
9. **`key: reference` is what makes a popup ref shared**. Without it, the
   template content gets inlined per popup and `usageCount` stays 0.
10. **JS: copy from templates** — copy from a page's `pages/<group>/<page>/js/` directory in the CRM template and modify
11. **SQL: two-step pattern** — `ctx.sql.save({uid, sql}) + ctx.sql.runById(uid)`
12. **Parent tables first** — seed data: insert tables without foreign keys first.
    For o2m/m2o relations, the seed must fill the FK column (e.g. `ticket_id`)
    on the child rows — leaving it null produces orphaned children.
13. **Do NOT define system columns** — never include `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `id` in collection YAML (auto-created by NocoBase)

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

# Deploy local DSL → NocoBase  (DSL is source of truth)
npx tsx cli/cli.ts push <user-dir> --force
npx tsx cli/cli.ts push <user-dir> --group <route-key>     # only one subtree

# Pull live NocoBase → local DSL  (covers menu, pages, popups, templates,
#                                  collections, defaults, layouts, event flows)
npx tsx cli/cli.ts pull <user-dir>

# Compare two DSL trees with UID/path normalization
npx tsx cli/cli.ts diff <left-dir> <right-dir>

# Duplicate a project to a new isolated module (new keys, optional title prefix)
npx tsx cli/cli.ts duplicate-project <src> <dst> --key-suffix _v2 --title-prefix "V2 - "

# Seed test data (resolves FK IDs from already-inserted rows — pass --count N)
npx tsx cli/cli.ts seed <user-dir> --count 5

# Verify data integrity (FK references, field completeness)
npx tsx cli/cli.ts verify-data <user-dir>
```

> Don't add an auto-sync between push and pull. Push is one-way DSL→NB; pull
> is one-way NB→DSL. Round-tripping is `push` + `pull` + `git diff`. See
> `src/PHILOSOPHY.md` for why.
