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

`templates/crm/` is the canonical reference library. Before writing any
non-trivial file, **open the closest CRM example and adapt it**. This
manual only covers workflow and gotchas — syntax lives in the template.

The pre-deploy spec validator catches most structural mistakes with a
clear error message. **Trust the validator**: when it errors, fix what
it says rather than guessing.

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

**Open the right CRM reference before you write:**

| Building | Open this CRM file |
|---|---|
| Full project layout | `templates/crm/` (root) |
| A standard list page (table + filter + popups) | `templates/crm/pages/main/leads/` |
| A multi-tab page | `templates/crm/pages/main/customers/` |
| A dashboard (jsBlock, KPI cards, grid widths) | `templates/crm/pages/main/overview/` |
| Charts & analytics | `templates/crm/pages/main/analytics/` |
| Collection DSL | `templates/crm/collections/*.yaml` |
| Block templates (forms/details) | `templates/crm/templates/block/` |
| Popup templates | `templates/crm/templates/popup/` |
| Menu tree | `templates/crm/routes.yaml` |
| m2o auto-popup bindings | `templates/crm/defaults.yaml` |

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

**Copy the whole page/template folder from CRM, then modify in place.**
Writing dashboards from scratch is a huge amount of glue — SQLs,
echarts render functions, KPI jsBlocks, filterForm wiring, grid
widths. The CRM analytics and overview pages are proven end-to-end;
`cp -r` them and retarget SQL/collection names instead of reinventing.

```bash
# Example: scaffold a pm Dashboard by copying CRM analytics
cp -r templates/crm/pages/main/analytics workspaces/pm/pages/pm/dashboard
# then edit:
#   page.yaml   → strip runtime UIDs, rename title
#   layout.yaml → change collection refs + field names
#   charts/*.sql   → point at your tables, simplify filter conditions
#   charts/*_render.js → swap title + fields, strip i18n if not needed
#   js/*.js     → rewrite KPI queries against your collections
```

**Copy existing JS, don't write from scratch.**

| Need | Copy from |
|---|---|
| KPI cards / dashboard hero | `templates/crm/pages/main/overview/js/` |
| Charts | `templates/crm/pages/main/analytics/js/` |
| Filter stat buttons | `templates/crm/pages/main/customers/tab_customers/js/customers_customers_filterForm_*.js` |

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
