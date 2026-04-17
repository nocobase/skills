# NocoBase DSL Reconciler — Developer Reference

TypeScript "NocoBase as Code" engine. Bidirectional sync between YAML/JS spec files and live NocoBase instances.

> **Read [PHILOSOPHY.md](./PHILOSOPHY.md) first** — it explains *why* the
> design is what it is. This file documents *how* the code is laid out.

## Project Layout

```
src/
├── client/              # NocoBase API client (flowSurfaces, collections, routes, models)
├── deploy/              # Deploy pipeline: DSL → NocoBase
│   ├── deploy-context.ts     # DeployContext (nb, log, force, copyMode) — per-run immutable
│   ├── project-deployer.ts   # Orchestrator: collections → templates → routes → pages → popups
│   ├── page-discovery.ts     # Spec loading: routes.yaml → layout.yaml → ref: resolution → popups
│   ├── surface-deployer.ts   # Block compose + default actions + field validation + layout
│   ├── block-filler.ts       # Fill block content (JS, charts, actions, templateRef, filter, clickToOpen)
│   ├── block-composer.ts     # Converts BlockSpec → compose API payload (pure function)
│   ├── popup-deployer.ts     # Popup deployment (tabbed, nested)
│   ├── popup-expander.ts     # Auto-derive edit/detail popups from addNew
│   ├── template-deployer.ts  # Popup template management (create, reuse, UID persistence)
│   ├── collection-deployer.ts # collections:apply (upsert)
│   ├── column-reorder.ts     # Table column ordering via moveNode
│   ├── spec-validator.ts     # Pre-deploy YAML validation
│   ├── scaffold.ts           # Project skeleton generator
│   └── fillers/              # Content fillers (one concern per file)
│       ├── action-filler.ts  # Actions: string/compact/full formats → addAction or save_model
│       ├── ai-button.ts      # AI employee button stepParams builder
│       ├── chart-filler.ts   # Chart SQL + render JS
│       ├── click-to-open.ts  # Field clickToOpen + popup binding
│       ├── divider-filler.ts # Dividers & markdown items
│       ├── event-flow-filler.ts # Event flows → flowRegistry
│       ├── field-layout.ts   # field_layout DSL → gridSettings
│       ├── filter-config.ts  # filterForm → connect fields to target tables
│       ├── grid-order.ts     # Grid item ordering via moveNode
│       └── js-filler.ts      # JS items/columns + sandbox validation
├── export/              # Export pipeline: NocoBase → DSL
├── acl/                 # ACL export/deploy (roles, scopes, permissions)
├── workflow/            # Workflow export/deploy
├── utils/               # Shared utilities (filter-validator, js-utils, slugify, uid)
├── types/               # TypeScript types (spec.ts = DSL, state.ts = UIDs, api.ts = API)
└── cli/cli.ts           # CLI entry point
```

## Deploy Pipeline Flow

```
CLI: deploy-project <dir> [--force] [--group "Main"] [--copy]
 │
 ├─ 1. LOAD SPECS (page-discovery.ts)
 │   ├─ Read routes.yaml → discover page directories
 │   ├─ Read layout.yaml per page → raw block specs
 │   ├─ Resolve ref: file references → inline template content
 │   └─ Read popups/*.yaml per page → popup specs
 │
 ├─ 2. DEPLOY COLLECTIONS (collection-deployer.ts)
 │   └─ Read collections/*.yaml → collections:apply (fields, relations)
 │
 ├─ 3. DEPLOY TEMPLATES (template-deployer.ts)
 │   ├─ Match existing templates by UID (state.yaml) or name
 │   ├─ Create missing popup templates
 │   └─ Persist template UIDs to state.yaml
 │
 ├─ 4. DEPLOY ROUTES + PAGES (project-deployer.ts → surface-deployer.ts)
 │   ├─ Create route groups + pages (desktopRoutes API)
 │   └─ For each page:
 │       ├─ Apply default actions (table→filter/refresh/addNew, etc.)
 │       ├─ Validate fields against live collection metadata
 │       ├─ Compose missing block shells (flowSurfaces:compose)
 │       ├─ Fill each block (block-filler.ts):
 │       │   ├─ Title, dataScope/filter, pageSize, sort
 │       │   ├─ Template reference (ReferenceFormGridModel)
 │       │   ├─ Actions (compact → stepParams → addAction/save_model)
 │       │   ├─ JS code, charts, dividers, event flows
 │       │   ├─ Field layout (field_layout DSL → gridSettings)
 │       │   └─ m2o clickToOpen auto-binding
 │       └─ Apply page layout (gridSettings.rows/sizes)
 │
 ├─ 5. DEPLOY POPUPS (popup-deployer.ts)
 │   ├─ Match popup target (block.action) → action UID
 │   ├─ Check existing content → skip if already deployed
 │   └─ Compose popup blocks + fill
 │
 ├─ 6. POST-DEPLOY (project-deployer.ts)
 │   ├─ m2o popup template binding pass (all blocks)
 │   ├─ Template UID persistence to state.yaml
 │   ├─ Post-verify (chart SQL, JS code, popup content)
 │   ├─ Auto-sync routes.yaml + rebuild graph/_refs.yaml
 │   └─ Return to CLI
 │
 └─ 7. DEPLOY-SYNC (cli.ts — auto-skipped for non-git dirs)
     ├─ Pre-deploy: git commit "pre-deploy snapshot" (rollback point)
     ├─ [deploy runs in step 2-6]
     ├─ git worktree add <dir>-worktree -b deploy-sync
     ├─ Copy state.yaml to worktree (UID tracking)
     ├─ export-project into worktree (live NocoBase → YAML)
     ├─ git commit "post-deploy export" in worktree
     ├─ git diff --stat main..deploy-sync (show what changed)
     ├─ Remove worktree (branch preserved for review)
     └─ User: git merge deploy-sync / git branch -D deploy-sync
```

## DSL Format Reference

### Block Types

| YAML type | NocoBase model | Compose? | Notes |
|-----------|---------------|----------|-------|
| `table` | TableBlockModel | Yes | Default actions: filter, refresh, addNew |
| `filterForm` | FilterFormBlockModel | Yes | MUST have field_layout |
| `createForm` | CreateFormBlockModel | Yes | Default action: submit |
| `editForm` | EditFormBlockModel | Yes | Default action: submit |
| `details` | DetailsBlockModel | Yes | Default recordAction: edit |
| `list` | ListBlockModel | Yes | |
| `gridCard` | GridCardBlockModel | Yes | |
| `jsBlock` | JSBlockModel | No | Requires `file:` path to JS |
| `chart` | ChartBlockModel | Yes | Uses chart_config |
| `markdown` | MarkdownBlockModel | No | |
| `iframe` | IframeBlockModel | No | |
| `reference` | ReferenceBlockModel | No | Uses `templateRef:` |

### Action Formats

Actions can be written in three formats:

```yaml
# 1. String (standard action — compose handles it)
actions:
  - filter
  - refresh
  - addNew

# 2. Compact (deployer builds stepParams)
actions:
  - type: ai
    employee: viz
    tasks_file: ./ai/tasks.yaml

  - type: link
    title: View All
    url: /admin/page-id

  - type: updateRecord
    key: approve
    title: Approve
    icon: checkoutlined
    assign: { status: approved }
    hiddenWhen: { status: approved }

# 3. Full (stepParams passed directly to NocoBase)
actions:
  - type: workflowTrigger
    key: trigger_merge
    stepParams:
      customCollectionTriggerWorkflowsActionSettings: { ... }
```

Default actions are added automatically if not declared:
- `table` → actions: [filter, refresh, addNew], recordActions: [edit, delete]
- `filterForm` → actions: [submit, reset]
- `createForm/editForm` → actions: [submit]
- `details` → recordActions: [edit]

### File References

```yaml
# ref: reads a template YAML file and inlines its block content
blocks:
  - ref: templates/block/form_add_new_customers.yaml
    key: createForm    # extra properties override template content

# file: references JS/SQL files (resolved at deploy time)
blocks:
  - type: jsBlock
    key: dashboard
    file: ./js/dashboard.js

  - type: chart
    chart_config: ./charts/revenue.yaml
```

### Filter Shorthand

```yaml
# Shorthand: { field.$operator: value }
filter:
  status.$in: [new, working]
  ai_score.$gte: '75'

# Equivalent full format
dataScope:
  logic: '$and'
  items:
    - path: status
      operator: '$in'
      value: [new, working]
    - path: ai_score
      operator: '$gte'
      value: '75'
```

## Key APIs

| API | Purpose |
|-----|---------|
| `flowSurfaces:compose` | Create block shells |
| `flowSurfaces:addAction` | Add toolbar actions |
| `flowSurfaces:addRecordAction` | Row-level actions (details/list/gridCard) |
| `flowSurfaces:setLayout` | Set grid rows/sizes |
| `flowModels:save` | Create/update any flow model (safe upsert) |
| `collections:apply` | Upsert collection + fields |
| `flowSurfaces:setFieldLinkageRules` | Field-level linkage rules |
| `flowSurfaces:setBlockLinkageRules` | Block-level linkage rules |

## DeployContext

Per-run immutable context threaded through all deploy functions:

```typescript
interface DeployContext {
  nb: NocoBaseClient;  // API client
  log: LogFn;          // Logging function
  force: boolean;      // Re-sync existing blocks
  copyMode: boolean;   // Tolerant mode for template copying
}
```

Adding new modes = add a field to DeployContext. No function signatures change.

## Pitfalls

See `src/PITFALLS.md` for the full list. Key ones:

- **flowModels:update clears parentId** — never call directly; use `client.updateModel()` (GET → merge → save)
- **desktopRoutes:update must use POST** — PUT returns 200 but silently does nothing
- **Details/List/GridCard are record action containers** — use `addRecordAction`, not `addAction`
- **resource.dataSourceKey is required** — compose blocks without it return 400
- **Popup blocks need binding** — editForm/details inside popups require `binding: 'currentRecord'`
- **gridSettings.rows semantics** — outer array = columns, inner array = vertically stacked blocks within a column
