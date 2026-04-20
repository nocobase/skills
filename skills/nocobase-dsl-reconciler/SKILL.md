---
name: nocobase-dsl-reconciler
description: >-
  **Opt-in DSL path** for NocoBase app building. Use ONLY when the user
  explicitly asks for YAML / DSL / committed-to-git / `cli push` / spec
  files — e.g. "use the DSL reconciler", "I want YAML I can commit",
  "build this as a workspaces/ project". For any other UI authoring
  request (new page, new block, tweak an existing screen), default to
  `nocobase-ui-builder` instead — this reconciler is still in active
  development and has rough edges that the live-UI path avoids.

  When the user opts in: produces/changes files under `workspaces/<project>/`,
  supports new pages, menus, modules, whole systems, collections, tables,
  sub-tables, popups, dashboards, approval workflows, recordActions, and
  deploys them via `cli push`.
argument-hint: "[system-name]"
allowed-tools: shell, local file reads, local file writes
version: 0.1.0
---

# NocoBase Application Builder (DSL path)

## Before you use this skill

This is the **opt-in DSL path**. Default is `nocobase-ui-builder`.
Stay on this skill only when the user explicitly wants YAML files they
can commit + `cli push`. If you arrived here from a generic "build me a
NocoBase app" request without the user naming DSL/YAML/git, switch to
`nocobase-ui-builder` instead — it's the default entry point.

## Golden rule

`templates/crm/` is a **read-only reference library**. When you're
unsure how a specific field, block, or popup is shaped, open the
closest CRM example, read it, then write your own adapted version in
your workspace. Per-scenario pointers live in the workflow sections below.

**Never** copy CRM files wholesale into your workspace. Do not
`cp -r templates/crm/...` to get started, do not duplicate
`collections/nb_crm_*.yaml`, do not base your `routes.yaml` on CRM's.
Bulk-copying drags unrelated leads/opportunities/orders state and
workflows into your project — you then spend the whole session fighting
hundreds of irrelevant validator errors instead of building your module.

The pre-deploy spec validator catches most structural mistakes with a
clear error message. **Trust the validator**: when it errors, fix what
it says rather than guessing — don't grep through `src/deploy/*.ts`.

## When NOT to use this skill

Hand off to the matching skill when the user's request is orthogonal:

| User asks for… | Skill |
|---|---|
| One-off live-UI tweak on an already-running page (move / reorder / reconfigure a single block, field, action) — **no DSL commit wanted** | `nocobase-ui-builder` |
| ACL / role permissions / route permissions | `nocobase-acl-manage` |
| Workflow authoring on a live NB instance (no YAML commit wanted) | `nocobase-workflow-manage` — live CLI/MCP, no YAML. This skill owns the committed YAML path; see the [Workflows](#workflows) section below. |
| Collection / field / relation authoring outside a DSL project | `nocobase-data-modeling` |
| Plugin development (`.tsx` components, server code) | `nocobase-plugin-development` |
| Install / enable plugin | `nocobase-plugin-manage` |
| Environment setup / app install / upgrade | `nocobase-env-bootstrap` |

Any change that should live as a committed YAML file under
`workspaces/<project>/` — stays here.

## Environment

```bash
cd <skill-dir>/src
export NB_USER=admin@nocobase.com NB_PASSWORD=admin123 NB_URL=http://localhost:14000
```

## Quick start — new build

**Default path for "build me a NocoBase app"**: copy the starter and
modify it. Do not hand-write the skeleton; do not study CRM first.

```bash
cd <skill-dir>/src
cp -r ../templates/starter ../workspaces/<name>

# First push: --copy bypasses validation rules that only matter once
# popups exist (m2o popup binding, clickToOpen file presence). The
# starter ships with its own popups so the first push is actually fully
# valid — --copy is for your *extensions* before popups are wired.
npx tsx cli/cli.ts push <name> --force
```

The starter is a complete minimal CRUD — 1 collection (Projects),
1 Dashboard page (4 KPI tiles + 2 charts), 1 list page with
filterForm / table / addNew popup / detail popup / 2 updateRecord
recordActions. Push as-is → visible in NB → then edit.

### Customizing the starter (the agile loop)

Iterate one concern at a time, push between each:

1. **Rename identifiers** to match the user's domain.
   - `collections/nb_starter_projects.yaml` → your collection name
     (match the `nb_<module>_<entity>` convention)
   - `routes.yaml`: change "Starter" / "Projects" titles
   - `pages/starter/` directory name if you want (match `routes.yaml`
     key)
   - Find-replace `nb_starter_projects` across all files
2. **Adjust the field list** in your collection YAML to match the
   user's entity. Update `pages/<...>/layout.yaml` `fields:` and the
   popup templates' `field_layout:` accordingly.
3. **Add a 2nd entity** only when the first one works end-to-end.
   Create a new `collections/*.yaml` + `pages/<module>/<entity>/` dir,
   copy `pages/starter/projects/layout.yaml` as a starting point.
4. **Extend incrementally**: add a tab, a chart, a workflow trigger.
   Push after every change. See "Advanced patterns" below for which
   CRM file matches which pattern.

**Never write the whole module in one shot.** For customer-facing
builds — land the skeleton, show the user, gather feedback, iterate.
The starter push takes minutes; a hand-built module takes hours.

### Fast-track: when `--copy` helps

Pass `--copy` when the workspace has **no popup files yet** (early
stage — validator would fire errors about "m2o field X has no popup
binding" that the user will fix in the next push). The reconciler
auto-bypasses spec errors in this state. Once any `popups/*.yaml`
exists, drop `--copy` and let validation run.

## Incremental edits — existing workspace

- **Add** a block / field / action / popup → write the DSL → push.
- **Remove** from DSL → push. The reconciler destroys the matching
  live model on the NB side and cleans `state.yaml`. Manual NB-UI
  authored elements (not tracked in `state.yaml`) are left alone.
- **Rename** → not supported automatically. Delete + re-add.

Targeted pushes:
- `--group <key>` scopes to one menu subtree
- `--page <key>` scopes to one page
- `--incremental` skips pages whose DSL hasn't changed since last push

**For pure live-UI tweaks without a DSL commit, hand off to
`nocobase-ui-builder` instead** (see the routing table above).

## Advanced workflow — when the starter isn't enough

Triggers for going beyond the agile starter loop:

- More than ~3 collections with cross-relations (m2m, tree structures)
- Dedicated workflow / approval / permission logic that the user wants
  designed up-front
- Multi-tab pages, sub-tables, or cross-module navigation
- Dashboard with bespoke KPIs mapped to the user's domain language

Progression: Round 0 design → Round 1 scaffold → Round 2 fill →
Round 2' seed → Round 3 JS. Each round is a deployable state.

### Round 0: System architecture — confirm with user

Write a `DESIGN.md` (markdown, not YAML) covering:

1. **Collections** — every table, its fields, and its relations.
   See `nocobase-data-modeling` skill for field-interface reference.
2. **Page list** — every page, one-line purpose each, grouped by menu.
3. **Navigation wiring** — which m2o fields open which popup
   templates; which pages link to each other.

Wait for user confirmation before writing YAML. A single design pass
saves 3× redesigns.

Skip Round 0 if the user's ask fits the starter shape (single entity,
basic CRUD).

Example:

```markdown
## Collections
- nb_lib_books (title, author, isbn, category, status, loans: o2m → nb_lib_loans)
- nb_lib_members (name, email, phone, join_date, loans: o2m → nb_lib_loans)
- nb_lib_loans (loan_no, book: m2o, member: m2o, borrowed_at, due_date, returned_at, status)

## Pages (under menu "Library")
- Books list — browse + search books, add new
- Members list — browse members, their loan history
- Loans list — active/overdue loans, return action
- Dashboard — KPIs + charts

## Navigation
- books.table.title → books detail popup (shared template)
- loans.table.book → books detail popup (shared via defaults.yaml)
- loans.table.member → members detail popup (shared via defaults.yaml)
```

### Round 0.5: Sub-agent CWD (only when spawning)

If launching a sub-agent (kimi TUI, Claude Code subprocess), its
CWD becomes the default write target. **Set it before launch:**

```bash
mkdir -p <user-workdir>
cd <user-workdir>
kimi --yolo       # or claude, codex
```

Skip the `cd` and the agent writes to the parent project root.

### Round 1: Scaffold — still start from the starter

Even in the advanced path, don't hand-write `routes.yaml` +
`collections/*.yaml` from scratch. Copy the starter, then grow:

| Step | What to do |
|---|---|
| Base | `cp -r templates/starter workspaces/<name>` — push once |
| Add collection | Write `collections/<next_coll>.yaml` (format matches starter's). Match `nb_<module>_<entity>` convention. |
| Add page | `mkdir pages/<module>/<page>/` + `layout.yaml`; mirror starter's projects layout. |
| Update routes | Add entry under the existing group in `routes.yaml`. |
| Deploy | `cli push <name> --force` after each collection/page addition |

CRM references (consult only when stuck on structure):
- `templates/crm/collections/nb_crm_leads.yaml` — collection format
- `templates/crm/routes.yaml` — multi-group routes (shape only)

### Round 2: Fill content — blocks, popups, templates

For each page beyond the starter basics:

| Building | CRM reference |
|---|---|
| Main list table + filter | `templates/crm/pages/main/leads/layout.yaml` |
| Multi-tab page | `templates/crm/pages/main/customers/` (`page.yaml` + `tab_*/layout.yaml`) |
| Create-form with inline sub-table for o2m children | `templates/crm/templates/block/form_add_new_opportunities_quotations_quotations.yaml` — `items` is an o2m field listed in `fields:` and rendered as an inline editable sub-table. Also `templates/crm/pages/main/products/` for master/child UX. |
| Detail-popup template | `templates/crm/templates/popup/activity_view.yaml` |
| m2o auto-popup bindings | `templates/crm/defaults.yaml` |
| Parent-detail + child-list popup | `templates/crm/pages/main/customers/tab_customers/popups/` |
| addNew + field click-popup pattern | `templates/crm/pages/main/leads/popups/` |

Rules for copying from CRM:
- Copy 10–30 lines, adapt names. **Never copy whole files.**
- Don't copy `uid:` / `targetUid:` / `route_id:` — deployer assigns fresh.
- For every m2o field displayed in a table, either set
  `clickToOpen: templates/popup/popup_detail_<target>.yaml` OR add
  `popups.<target>: ...` in `defaults.yaml`. Validator errors otherwise.

#### Per-row actions (`recordActions`)

By default a table's row-action column is empty — NB won't render
any action buttons unless `recordActions:` lists them. "Just edit
and delete" is a common but weak default: for most list tables the
user actually wants a **one-click state change** (Mark Done,
Approve, Archive) sitting next to edit.

Decision order:

1. **Is there a boolean / enum status field?** → add `updateRecord`
   with `linkageRules` to show the matching button only when the
   record is in the right state. One button per state transition
   (Mark Done hidden when already done; Reopen hidden when not done).
2. **Does the record need a second detail/form view different from
   the default edit popup?** → `popup` with `templateRef`.
3. **Tree/hierarchy collection?** → add `addChild`.
4. **Need to navigate elsewhere with this record's id/filter?** →
   `link` with `url: /admin/...?filter={{ctx.record.id}}`.
5. **Want to let the user clone a complex record?** → `duplicate`.
6. **Need to start a workflow manually?** → `workflowTrigger`.

**Prefer `updateRecord + linkageRules` over custom JS buttons** for
state changes. linkageRules covers 80% of row-level UX (conditional
show/hide, field-based gating, role checks via `ctx.user`) without
touching JS. JS actions are only needed for multi-step logic
(query, then update, then navigate) and are not currently
deployable by this reconciler.

Full per-row action palette (declared in `recordActions:`):

| DSL `type` | Purpose | CRM reference |
|---|---|---|
| `edit` | Edit popup (default shape) | many |
| `view` | Read-only detail popup | `templates/crm/templates/popup/opportunity_view.yaml` |
| `delete` | Single-row delete with confirm | many |
| `updateRecord` | Assign fields + optional linkageRules — the state-change workhorse | `templates/crm/pages/main/overview/layout.yaml` (Done / Undone pair) |
| `popup` | Open a custom popup with `templateRef` (form/detail different from edit) | `templates/crm/pages/main/leads/popups/table.name.yaml` |
| `link` | Navigate to another admin page, carrying record context in URL | `templates/crm/pages/lookup/layout.yaml` |
| `addChild` | Tree collection: add a child node under this row | `templates/crm/pages/main/products/tab_categories/layout.yaml` |
| `duplicate` | Clone the record into a new form | — |
| `workflowTrigger` | Manually trigger a workflow on this record | (toolbar in `templates/crm/pages/main/customers/tab_customers/layout.yaml` — same shape works per-row) |
| `historyExpand` / `historyCollapse` | Record-history plugin inline expand | — |
| `ai` | AI employee button (tasks_file + employee) | `templates/crm/pages/main/leads/layout.yaml` (toolbar — same shape per-row) |

Toolbar actions (declared in block-level `actions:`) use the same
type names plus `filter`, `refresh`, `addNew`, `bulkDelete`,
`export`, `import`. Not every type makes sense in both contexts —
`updateRecord` as a toolbar action would apply to *no* specific row,
so put it in `recordActions`.

**Goal of Round 2**: all pages have working CRUD — add / edit / view
popups wired correctly, row-action columns reflect real per-record
operations (not just edit+delete). Validator clean, NB UI shows no
"Collection may have been deleted" banners.

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

### Table vs sub-table — two different things, don't confuse

| | **Table** | **Sub-table** |
|---|---|---|
| What it is | Full CRUD block (filter + list + add/edit popups) for child records of a parent | Inline editable grid for child rows, lives INSIDE a parent form |
| DSL | `type: table` + `resource_binding.sourceId + associationName` | `{ field: tasks, type: subTable, columns: [...] }` inside a createForm/editForm's `fields:` |
| Where used | Detail popup, tab page, standalone-list popup | Inside createForm / editForm |
| Use when | Children browsed separately (customer detail → orders list) | Children entered alongside parent (invoice + line items) |

Bare `- tasks` in a form is the third option: a **RecordSelect picker**
("pick existing record"). Rarely what you want — validator warns.

Canonical CRM examples:
- Table (standalone CRUD block): `templates/crm/pages/main/customers/tab_customers/popups/table.name.yaml`
- Sub-table (inline editable grid): `templates/crm/templates/block/form_add_new_opportunities_quotations_quotations.yaml` (`items`)

### `foreignKey` flips meaning

On **m2o**, `foreignKey` names the FK column on the *current* table
(`owner: m2o, foreignKey: owner_id` → `owner_id` on SELF).

On **o2m**, `foreignKey` names the FK column on the *target* table
(`tasks: o2m → nb_pm_tasks, foreignKey: project_id` → `project_id` on
`nb_pm_tasks`).

## Workflows

Committed workflow YAML lives at
`workspaces/<project>/workflows/<slug>/workflow.yaml`. Push deploys, pull
exports, and each is one-way. Full format + authoring reference:
**[src/workflow/DSL.md](src/workflow/DSL.md)**.

Minimum shape — trigger type, collection, graph, per-node core config.
Everything else (workflow `options`, pagination defaults, `dataSource: main`,
`engine: basic`, …) is filled by the deployer.

```yaml
title: Notify on new project
type: collection
enabled: false
trigger:
  collection: nb_starter_projects
  mode: 1                              # 1=create, 2=update, 3=both, 4=delete, 7=all
graph:
  - notify
nodes:
  notify:
    type: notification
    config:
      channelName: in-app-message
      title: 'New project: {{$context.data.name}}'
      content: 'Created by {{$context.data.owner.nickname}}'
      receivers:
        - filter:
            $and:
              - id:
                  $eq: '{{$context.data.owner_id}}'
```

The starter ships this file — `templates/starter/workflows/notify_on_new_project/`.

### When authoring, hold to

- Node names in `graph:` are DSL identities. Variable refs like
  `{{$jobsMapByNodeKey.<name>.xxx}}` use the DSL name; the deployer rewrites
  to the runtime key.
- Every `filter:` / `condition:` object must root on `$and` or `$or` — a flat
  `{field: ...}` at the root is rejected.
- Merge points aren't supported — NB stores one upstream per node. If two
  branches need to trigger the same action, put the action in both branches or
  route to a downstream catch-all.
- Frozen workflows (executed ≥ 1) are auto-revisioned on push; the workflow
  `key` is stable so page-action references keep working.
- Approval forms + task cards are FlowModel trees — DSL doesn't redesign that
  surface. They live under `workflows/<slug>/ui/<purpose>.yaml` and are
  round-tripped verbatim.

### When authoring, don't

- Don't reinvent field names. Use NB-native keys (`config.collection`,
  `params.filter`, `params.values`, `channelName`, …) — no DSL sugar.
- Don't hand-write `options.stackLimit` / `params.sort: []` / `dataSource: main`
  etc. — the deployer fills them. Override only when you need something
  non-default.
- Don't copy whole CRM workflow files. Open the matching example, lift the
  pattern (trigger shape, node types, graph edges), and rename in your own
  file. Wholesale copies drag in irrelevant `approvalUid`s and UIs.

### Node type cheat sheet

`collection` / `schedule` / `action` / `approval` / `webhook` / `custom-action`
/ `request-interception` (triggers) · `query` / `create` / `update` / `destroy`
/ `sql` / `aggregate` / `condition` / `multi-condition` / `calculation` /
`notification` / `mailer` / `cc` / `request` / `delay` / `loop` / `parallel` /
`manual` / `approval` / `subflow` / `script` / `end` / `output` /
`response` / `response-message` / `json-query` / `json-variable-mapping`.

Core config required per type is in [DSL.md](src/workflow/DSL.md#nodes).

### Pattern samples

For node types CRM doesn't use, see `templates/workflow-samples/` — one
minimum-viable workflow per pattern (HTTP request, loop, parallel, manual,
subflow, webhook, end/output). Lift the shape; placeholders like
`nb_demo_*` won't deploy without rename.

### Handing off

Use `nocobase-workflow-manage` instead when the user wants to tweak workflows
directly on a running NB instance without a YAML commit — that skill is
CLI/MCP-only and doesn't touch this project's file tree.

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
npx tsx cli/cli.ts validate-workflows <name>    # workflow-only spec lint
npm --prefix src run test:workflow              # workflow unit tests (normalize + validator)

# demo-instance cleanup (destructive, not for production)
python3 scripts/cleanup-copy.py                 # drop all Copy/[Copy]-prefixed artefacts
python3 scripts/cleanup-non-crm.py              # drop nb_starter_* / nb_pm_* / non-CRM workflows + routes
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
| Per-row column shows only edit+delete | `recordActions` missing — see "Per-row actions" below for what to add. Removing an action/field/column from the DSL now *does* destroy it on the NB side on next push. |

---

If any of the above contradicts what you observe at runtime, the manual
is stale — note what was missing and tell the user.
