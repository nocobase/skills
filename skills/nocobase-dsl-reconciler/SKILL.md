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

Build in rounds — don't mix. Each round produces a deployable state.

```
Round 0  System architecture (written design, user confirms)
Round 0.5 Session setup (sub-agent CWD only)
Round 1  Scaffold: collections + routes + empty pages, push
Round 2  Fill pages: blocks, layouts, popups, block templates, push
         (in parallel) Round 2': seed test data via API
Round 3  JS: where CRM has it, you probably need it too
```

### Round 0: System architecture — MUST confirm with user

Write a design doc (markdown, not YAML) covering:

1. **Collections** — every table, its fields, and its relations.
   See `nocobase-data-modeling` skill for field-interface reference.
2. **Page list** — every page you will create, with a one-line
   purpose each. Group by menu section.
3. **Navigation wiring** — which m2o fields open which popup
   templates; which pages link to each other.

Output this as `DESIGN.md` in the project root. **Wait for user
confirmation** before touching YAML files. A single design pass saves
3× redesigns in the next rounds.

Example skeleton:

```markdown
## Collections
- nb_lib_books (title, author, isbn, category, status, loans: o2m → nb_lib_loans)
- nb_lib_members (name, email, phone, join_date, loans: o2m → nb_lib_loans)
- nb_lib_loans (loan_no, book: m2o, member: m2o, borrowed_at, due_date, returned_at, status)

## Pages (under menu "Library")
- Books list — browse + search books, add new
- Members list — browse members, their loan history
- Loans list — active/overdue loans, return action
- Dashboard — KPIs + charts (optional, Round 3)

## Navigation
- books.table.title → books detail popup (shared template)
- loans.table.book → books detail popup (shared via defaults.yaml)
- loans.table.member → members detail popup (shared via defaults.yaml)
```

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

### Round 1: Scaffold — collections + routes + empty pages

First deployable state. Don't fill page content yet; get the skeleton
working end-to-end.

Files to write:

| File | Contents | CRM reference |
|---|---|---|
| `collections/<coll>.yaml` per table | name, titleField, fields (with select options, m2o target, o2m foreignKey) | `templates/crm/collections/nb_crm_leads.yaml` |
| `routes.yaml` | group → children tree for every page in DESIGN.md | `templates/crm/routes.yaml` (shape only) |
| `pages/<group>/<page>/layout.yaml` per page | One placeholder `table` block per page, no popups yet | (leave minimal) |

Workspace path: `cli push myapp` resolves to `workspaces/myapp/`.
Override with `NB_WORKSPACE_ROOT=/some/path`. Each project auto `git init`s
on first push/pull.

Deploy: `npx tsx cli/cli.ts push <name> --force`.

**Goal of Round 1**: the validator passes; menu tree renders; every
page shows an empty-ish table with the right collection. No popups,
no forms, no JS yet.

### Round 2: Page content — blocks + popups + templates

Now fill each page. Do this page-by-page, deploying after each.

Per page, for each block:

| Building | Reference this CRM file |
|---|---|
| Main list table + filter | `templates/crm/pages/main/leads/layout.yaml` |
| Multi-tab page | `templates/crm/pages/main/customers/` (`page.yaml` + `tab_*/layout.yaml`) |
| Create-form template (with inline sub-table for o2m children) | `templates/crm/templates/block/form_add_new_opportunities_quotations_quotations.yaml` — `items` is an o2m field listed in `fields:` and rendered as an inline editable sub-table by the deployer. Also see `templates/crm/pages/main/products/` for the canonical "master record + editable child rows" UX (products own pricing tiers via o2m). |
| Detail-popup template | `templates/crm/templates/popup/activity_view.yaml` |
| m2o auto-popup bindings | `templates/crm/defaults.yaml` |
| Parent-detail + child-list popup | `templates/crm/pages/main/customers/tab_customers/popups/` |
| addNew + field click-popup pattern | `templates/crm/pages/main/leads/popups/` |

Tips:
- Copy the 10–30 lines you need from the CRM file, then change
  collection / field / title names. **Do not copy whole files.**
- Don't copy `uid:` / `targetUid:` / `route_id:` — runtime IDs that
  the deployer assigns fresh.
- For every m2o field displayed in a table, either set
  `clickToOpen: templates/popup/popup_detail_<target>.yaml` OR add
  `popups.<target>: ...` in `defaults.yaml`. Validator errors otherwise.

**Goal of Round 2**: all pages have working CRUD — add / edit / view
popups wired correctly. Validator clean, NB UI shows no "Collection
may have been deleted" banners.

### Round 2': Test data (parallel with Round 2)

Can run concurrently with page-filling. Insert data via API:

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

Parent tables first; fill every FK on children (leaving it null
orphans the row). Then:

```bash
npx tsx cli/cli.ts verify-data <name>     # FK & completeness check
```

Why parallel: Round 3 JS (charts, KPIs) needs data to render
anything. Start the seed once you have collections (end of Round 1);
by the time Round 2 finishes pages, you have records to test against.

### Round 3: JS — where CRM uses it, you probably need it

Now that CRUD + data work, audit where JavaScript adds value. **Walk the
CRM template and ask "does the CRM have JS here?" for each spot in your
project.** Three typical JS opportunities:

| Spot | CRM has JS? | Your project likely needs JS if... |
|---|---|---|
| **Field renderer / column** (e.g. color-coded status tag, days-until-due badge) | ✅ in most list tables | Any field whose display depends on a derived value (date math, status-to-color, multi-field composite) |
| **Block** (KPI card, custom widget inside a form) | ✅ overview, analytics, per-form tips | A summary widget, inline chart, or "helper panel" that reads from multiple collections |
| **Dashboard page** (whole page of charts + KPIs) | ✅ analytics page | Module has ≥3 measurable metrics users care about; validator **requires** ≥5 charts on pages titled "Dashboard" / "Analytics" |

Start by grepping the matching CRM page and its `js/` + `charts/`
folders to confirm where the CRM adds JS. Then write YOUR JS file
adapted from the single-file table below.

**Dashboards specifically look bad when designed freehand — mirror the
CRM shape.** Open the reference layout first, copy its **block count,
ordering, and grid widths** into your own `layout.yaml`; then fill in
leaf files with your content.

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

### Inline sub-table on o2m/m2m fields needs EXPLICIT `type: subTable`

By default, an o2m/m2m field listed in a form renders as a
**RecordSelect** widget ("pick existing records"). To get inline
editable rows (the canonical master-child UX), declare the field as
an object with `type: subTable` + `columns:`:

```yaml
# Right — inline editable sub-table with columns
fields:
  - name
  - code
  - ...
  - field: tasks
    type: subTable
    columns:
      - field: title
      - field: status
      - field: assignee
      - field: due_date
```

```yaml
# Wrong — renders as "select existing task" picker, not editable rows
fields:
  - name
  - code
  - tasks           # ← bare string = RecordSelectFieldModel default
```

Put the field in `field_layout` normally (usually full-row, width 16+
so columns fit). Canonical CRM example:
`templates/crm/templates/block/form_add_new_opportunities_quotations_quotations.yaml`
(quotations `items` → 10-column inline sub-table for quote line items).

This is different from a *popup sub-list* (standalone `type: table`
block inside a popup, bound via `resource_binding.sourceId +
associationName`). That one is a separate block with its own add/edit
popup — use when you want a full table UX, not inline editing.

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
