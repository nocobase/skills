# NocoBase DSL Reconciler — Developer Reference

TypeScript "NocoBase as Code" engine. Bidirectional sync between YAML/JS spec files and live NocoBase instances.

## Project Layout

```
src/
├── client/              # NocoBase API client (flowSurfaces, collections, routes, models)
├── deploy/              # Deploy pipeline: DSL → NocoBase
│   ├── project-deployer.ts    # Orchestrator: discoverPages → blueprint → deploySurface → popups
│   ├── blueprint-converter.ts # Converts DSL into applyBlueprint document format
│   ├── surface-deployer.ts    # Block compose + sync + layout
│   ├── block-filler.ts        # Fills block content (JS, charts, actions, templateRef, clickToOpen)
│   ├── popup-deployer.ts      # Popup deployment (tabbed, nested)
│   ├── collection-deployer.ts # collections:apply (upsert)
│   └── fillers/               # Sub-modules: action, chart, js, divider, field-layout, click-to-open
├── export/              # Export pipeline: NocoBase → DSL
│   ├── project-exporter.ts    # Full project export
│   └── block-exporter.ts      # Single block → YAML conversion
├── acl/                 # ACL export/deploy (roles, scopes, permissions)
├── workflow/            # Workflow export/deploy
├── utils/
│   ├── filter-validator.ts    # Shared filter validation (ACL scopes, dataScope, linkage)
│   └── js-utils.ts            # JS code header/description extraction
├── types/               # TypeScript types (spec.ts = DSL, state.ts = UIDs, api.ts = API responses)
└── cli/cli.ts           # CLI entry point
```

## Commands

```bash
cd src
export NB_USER=admin@nocobase.com NB_PASSWORD=admin123 NB_URL=http://localhost:14000

# Deploy (blueprint mode — single API call per page)
npx tsx cli/cli.ts deploy-project <dir> --group "CRM Copy" --blueprint

# Deploy (legacy mode — compose + fillBlock multi-step)
npx tsx cli/cli.ts deploy-project <dir> --group "CRM Copy"

# Export
npx tsx cli/cli.ts export-project <dir> --group "Main"

# ACL
npx tsx cli/cli.ts export-acl <dir>
npx tsx cli/cli.ts deploy-acl <dir> --dry-run

# Type check
npx tsc --noEmit
```

## Blueprint vs Legacy Deploy

- **Blueprint** (`--blueprint`): Calls `flowSurfaces:applyBlueprint` — one API call creates an entire page (navigation, blocks, fields, actions, layout, JS/charts). Then `deploySurface` runs in sync mode to clean up auto-created actions, add non-standard actions, and apply linkage rules.
- **Legacy** (default): Multi-step sequence: `compose` → `fillBlock` → `setLayout` → `addAction`.
- Blueprint automatically falls back to legacy on failure (e.g. unsupported block types).

## Deploy Order

1. Collections (tables + fields)
2. Templates (created first so later steps can reference them)
3. Routes (menu groups + pages)
4. Page blocks (compose + fillBlock)
5. Popups (popup-deployer, using popup files or inline popup content)
6. clickToOpen (sets popupSettings — popup must already be deployed)
7. Post-verify + SQL verify
8. Auto-sync (re-export to keep local files in sync)
9. Graph rebuild + `_refs.yaml`

## Popup Deploy Priority

Evaluated in this order:

1. **Inline popup** — field spec contains `popup:` with blocks/tabs → deploySurface / deployPopup
2. **Popup file** — `popups/*.yaml` → popup-deployer (validates blockCount match)
3. **Template copy** — loadTemplateContent → deploySurface
4. **Default fallback** — compose a default details block with collection fields

## Key APIs

| API | Purpose |
|-----|---------|
| `flowSurfaces:applyBlueprint` | Whole-page deploy (blueprint mode) |
| `flowSurfaces:compose` | Create block shells |
| `flowSurfaces:addAction` | Add toolbar actions |
| `flowSurfaces:addRecordAction` | Add row-level actions (details/list/gridCard blocks require this, not addAction) |
| `collections:apply` | Upsert collection + fields |
| `flowSurfaces:setFieldLinkageRules` | Field-level linkage rules |
| `flowSurfaces:setBlockLinkageRules` | Block-level linkage rules |
| `flowSurfaces:setActionLinkageRules` | Action-level linkage rules |

## Filter Validation

`src/utils/filter-validator.ts` — shared logic for ACL scopes, dataScope, and linkage rules:
- Validates field existence across L1 + L2 relation chains
- Detects relation field misuse (e.g. `createdBy: true` → should be `createdById`)
- Checks operator validity per field type
- Context-aware: ACL allows `{{$user.id}}` variables; dataScope forbids them

## Pitfalls

See `src/PITFALLS.md` for the full list. Key ones:

- **flowModels:update clears parentId** — never call directly; use `client.updateModel()` (GET → merge → save)
- **desktopRoutes:update must use POST** — PUT returns 200 but silently does nothing
- **desktopRoutes:update params format** — use `{ params: { 'filter[id]': id } }`, not a URL string
- **desktopRoutes:set for ACL routes** — send flat array `[id1, id2]`, not `{values: [...]}`
- **Details/List/GridCard are record action containers** — use `addRecordAction`, not `addAction`
- **enableTabs lives on the route, not the flowModel** — writing to `stepParams.pageSettings.general.enableTabs` has no effect
- **resource.dataSourceKey is required** — compose blocks without it return 400
- **Popup blocks need binding** — editForm/details inside popups require `binding: 'currentRecord'`
- **gridSettings.rows column/row semantics** — outer array = columns, inner array = vertically stacked blocks within a column

## Roundtrip Testing

See `/tmp/crm-roundtrip/README.md` for the deploy → export → diff verification workflow.
