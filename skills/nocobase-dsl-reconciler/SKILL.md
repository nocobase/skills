---
name: nocobase-dsl-reconciler
description: >-
  Build NocoBase applications from YAML DSL + JS specs.
  Trigger: user wants to build, create, scaffold, or deploy a NocoBase system/module.
argument-hint: "[system-name]"
allowed-tools: shell, local file reads, local file writes
---

# NocoBase Application Builder

## Golden rule

`templates/crm/` is a **read-only reference library**. When you're
unsure how a specific field, block, or popup is shaped, open the
closest CRM example, read it, then write your own adapted version in
your workspace. Per-scenario pointers live in Rounds 1/3/4 below.

**Never** copy CRM files wholesale into your workspace. Do not
`cp -r templates/crm/...` to get started, do not duplicate
`collections/nb_crm_*.yaml`, do not base your `routes.yaml` on CRM's.
Bulk-copying drags unrelated leads/opportunities/orders state and
workflows into your project — you then spend the whole session fighting
hundreds of irrelevant validator errors instead of building your module.

The pre-deploy spec validator catches most structural mistakes with a
clear error message. **Trust the validator**: when it errors, fix what
it says rather than guessing — don't grep through `src/deploy/*.ts`.

## Environment

```bash
cd <skill-dir>/src
export NB_USER=admin@nocobase.com NB_PASSWORD=admin123 NB_URL=http://localhost:14000
```

## Workflow

### Round 0: Design — MUST confirm with user first

List collections, fields, relationships. Wait for user confirmation
before writing files. See the `nocobase-data-modeling` skill.

### Round 0.5: Session setup (sub-agent spawns only)

If you're launching a sub-agent (kimi TUI, Claude Code subprocess, etc.),
its process CWD becomes its default write target. **Set it before launch:**

```bash
mkdir -p <user-workdir>
cd <user-workdir>
kimi --yolo       # or claude, codex
```

Skip the `cd` and the agent inherits the launcher's CWD (often a parent
project root), creating files in the wrong place. It can't recover from
this mid-session — by the time it reads the prompt, CWD is already wrong.

### Round 1: Create files + deploy

Workspace path: `cli push myapp` resolves to `workspaces/myapp/`.
Override with `NB_WORKSPACE_ROOT=/some/path`. Each project auto `git init`s
on first push/pull.

**Before writing each piece, open the matching CRM file to see the
shape — then hand-write your own adapted version in your workspace:**

| Building | Reference this CRM file |
|---|---|
| A standard list page (table + filter + popups) | `templates/crm/pages/main/leads/layout.yaml` |
| A multi-tab page | `templates/crm/pages/main/customers/` (see `page.yaml` + `tab_*/layout.yaml`) |
| A collection with relations & selects | `templates/crm/collections/nb_crm_leads.yaml` |
| A create-form template (with sub-table) | `templates/crm/templates/block/form_add_new_opportunities_quotations_quotations.yaml` |
| A detail-popup template | `templates/crm/templates/popup/activity_view.yaml` |
| Menu tree shape | `templates/crm/routes.yaml` (just the *shape* — your `routes.yaml` lists *your* pages) |
| m2o auto-popup bindings | `templates/crm/defaults.yaml` |

Tips for adapting:
- Copy the 10–30 lines you need from the CRM file into your new file,
  then change collection / field / title / route names.
- Don't copy `uid:` / `targetUid:` / `route_id:` — those are runtime
  IDs from CRM's deployed state. Leave them out; the deployer assigns
  fresh ones.

Deploy: `npx tsx cli/cli.ts push <name> --force`.
The validator blocks bad DSL with specific messages. Fix those and re-push.

### Round 2: Test data

`cli seed` was retired (too many false-positive FK warnings). Insert data
ad-hoc via API or SQL:

```bash
TOKEN=$(curl -sS -X POST $NB_URL/api/auth:signIn \
  -H 'Content-Type: application/json' -H 'X-Authenticator: basic' \
  -d '{"account":"'$NB_USER'","password":"'$NB_PASSWORD'"}' \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["token"])')

# Always GET existing record IDs first — they're snowflake integers
# (e.g. 359571523764224), NEVER 1/2/3.
curl -sS -X POST $NB_URL/api/<collection>:create -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{...fields..., "owner":{"id": <real-user-id>}}'
```

Parent tables first; fill every FK on children (leaving it null orphans
the row). Then:

```bash
npx tsx cli/cli.ts verify-data <name>     # FK & completeness check
```

### Round 3: Popups + details

Edit templates and popup bindings, then `push --force`. See
`templates/crm/pages/main/leads/popups/` for the `addNew` + `fields.<x>`
pattern, and `templates/crm/pages/main/customers/tab_customers/popups/`
for the parent-detail + child-list pattern.

### Round 4: JS + Charts + Dashboard (optional)

**Dashboards look bad when designed freehand — mirror the CRM shape.**
Open the reference layout first, copy its **block count, ordering, and
grid widths** into your own `layout.yaml`; then fill in leaf files with
your content.

| Reference layout | What to mirror |
|---|---|
| `templates/crm/pages/main/overview/layout.yaml` | Overview: 1 jsBlock hero row, 2 small tables underneath. Use for a landing page with a few KPIs. |
| `templates/crm/pages/main/analytics/layout.yaml` | Full dashboard: filterForm row → 4 KPI jsBlocks in one row → 5 charts in a `16/8 ∣ full ∣ 14/10` grid. Use when you want ≥5 charts (validator requires this when the page title contains `dashboard` or `analytics`). |

Procedure:
1. Open the reference `layout.yaml`. Note the block keys / types / widths.
2. Write YOUR `layout.yaml` with the SAME shape — same number of blocks,
   same grid widths in the `layout:` section — but your own block
   keys and your own collection names.
3. For each block's leaf JS/SQL file, copy from the single-file table
   below. **Copy files individually**; do not `cp -r` the folder.

| Leaf file to copy | Reference |
|---|---|
| KPI card jsBlock | `templates/crm/pages/main/overview/js/overview_jsBlock.js` |
| Filtered summary jsBlock | `templates/crm/pages/main/analytics/js/analytics_jsBlock.js` |
| Chart SQL (grouped counts) | `templates/crm/pages/main/analytics/charts/analytics_chart_2.sql` |
| Chart render (echarts bar/pie) | `templates/crm/pages/main/analytics/charts/analytics_chart_2_render.js` |
| Filter stat buttons on filterForm | `templates/crm/pages/main/customers/tab_customers/js/customers_customers_filterForm_customer_stats_filter_block.js` |
| Full-page custom UI (wizard / multi-step / custom flow) | `templates/crm/pages/main/customers/tab_merge/js/customers_merge_jsBlock.js` — whole page is one `type: jsBlock`, ~580 lines React |

After copying each leaf file:
- Rename in place and retarget SQL/collection/field names.
- Remove `ns: 'nb_crm'` i18n wrappers unless your module has i18n.
- Simplify `ctx.var_form1.*` filter var references if your page's
  filterForm uses different field keys.

SQL charts: save + run as a two-step pattern —
`ctx.sql.save({uid, sql})` then `ctx.sql.runById(uid)`.

## Core concepts

### Two identifiers: `key` and `title`

`key` = lower_snake_ascii identity — drives directory names under `pages/`
and entries in `state.yaml`. Always write it explicitly when the title
isn't pure ASCII (Chinese/spaces slugify to gibberish).

`title` = display text as the user wants it shown.

```yaml
- key: it_ops
  title: IT 运维
  type: group
  children:
    - key: tickets
      title: 工单
```

### Two popup modes: `key: reference` vs bare `ref:`

**`key: reference`** — popup block is a *reference* to the template.
Editing the template updates every popup that references it. Use for any
shared Add/Edit form.

```yaml
blocks:
  - ref: templates/block/form_add_new_tickets.yaml
    key: reference           # REQUIRED for shared refs
```

**Bare `ref:`** (no `key: reference`) — template content is *inlined*
per popup; each copy is independent. Use only to factor a bulky block
out of the page file.

After deploy, a shared template's `usageCount` should be ≥ 1. If it
stays at 0, `key: reference` was forgotten.

### Auto-created columns — do NOT declare them

NocoBase auto-creates these; declaring them causes silent filtering or
type conflicts:

- System columns: `id`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`
- m2o / o2m FK columns: declaring `owner: m2o → users` auto-creates
  `owner_id`; don't add a second `owner_id: integer` row
- m2m join tables: `through: nb_x_y` is auto-created; don't write a
  collection YAML for it

### `foreignKey` flips meaning

On **m2o**, `foreignKey` names the FK column on the *current* table
(`owner: m2o, foreignKey: owner_id` → `owner_id` on SELF).

On **o2m**, `foreignKey` names the FK column on the *target* table
(`tasks: o2m → nb_pm_tasks, foreignKey: project_id` → `project_id` on
`nb_pm_tasks`).

## Command reference

```bash
cd <skill-dir>/src
export NB_USER=... NB_PASSWORD=... NB_URL=...

npx tsx cli/cli.ts push <name> --force          # deploy DSL → NocoBase
npx tsx cli/cli.ts push <name> --group <key>    # only one subtree
npx tsx cli/cli.ts push <name> --incremental    # skip unchanged (git diff)

npx tsx cli/cli.ts pull <name>                  # NocoBase → DSL (full round-trip)
npx tsx cli/cli.ts diff <left> <right>          # compare two DSL trees
npx tsx cli/cli.ts duplicate-project <src> <dst> --key-suffix _v2

npx tsx cli/cli.ts verify-data <name>           # FK / completeness check
```

push and pull are both one-way. Round-tripping = push + pull + git diff.

## Common errors

| Error | Fix |
|-------|-----|
| `fields not in collection` | Field names don't match the collection YAML |
| `titleField is missing` | Set `titleField: <field>` or add a `name`/`title` field |
| Only some pages deployed | `key` mismatch with a `pages/<key>/` directory |
| `string violation` on create | `createdAt`/`updatedAt` declared in YAML — remove |
| Chart SQL failed | Seed data first; quote field names like `"createdAt"` |
| m2o link 400 in UI | Missing `defaults.yaml` `popups:` binding for target collection |
| `Collection X not found in data source main` | `associationName` used a short name — use the full collection name (`nb_pm_projects.tasks`, not `project.tasks`). See `templates/crm/pages/main/customers/tab_customers/popups/` |

---

If any of the above contradicts what you observe at runtime, the manual
is stale — note what was missing and tell the user.
