# Dynamic validation scenarios

Validation now uses dynamic scenario planning instead of a fixed case registry.

## Generation flow

1. Identify the business domain from request text, slug, and session signals:
   - order fulfillment
   - customer growth
   - project delivery
   - approval operations
   - org operations
2. Choose the page archetype for that domain:
   - collection workbench
   - 360 details workbench
   - tabbed business workbench
   - approval processing console
   - tree operations page
3. Combine the main block family:
   - `FilterFormBlockModel`
   - `TableBlockModel`
   - `DetailsBlockModel`
   - `CreateFormModel`
   - `EditFormModel`
   - row actions, details actions, and popup flows
4. Extend the plan with instance-aware root blocks:
   - call `PostFlowmodels_schemabundle` with `uses=['BlockGridModel']` to discover available public root blocks
   - call `PostFlowmodels_schemas` for those root blocks to fetch `dynamicHints`, `contextRequirements`, and `unresolvedReason`
   - rank blocks through domain signals, archetype, request keywords, and those dynamic hints

## Instance inventory source

- use NocoBase MCP tools `PostFlowmodels_schemabundle` and `PostFlowmodels_schemas`
- `schemaBundle` answers which root blocks exist in the current instance
- `schemas` adds semantic hints for matching and guard explanations
- persist the result as `instanceInventory.flowSchema.rootPublicUses` or `publicUseCatalog`
- `scripts/spec_contracts.mjs build-validation-specs` may ingest an inventory file through `--instance-inventory-file`
- if you only have raw MCP output, use `scripts/instance_inventory_probe.mjs materialize --schema-bundle-file ... --schemas-file ...`

## Real-scene policy

- charts, grid cards, maps, and comments should not be shoved into a generic trailing extension area
- the default bias is `insight-first`
- for overview, dashboard, trend, KPI, or explanatory requests, rank `ChartBlockModel`, `GridCardBlockModel`, and `JSBlockModel` first instead of forcing a primary table/details layout
- planner candidates do not need to include `TableBlockModel` or `DetailsBlockModel` when `filter + insight surface` already expresses the goal
- guard and compile fallback validate legality only; they do not rank the candidate pool

## Visualization defaults

- overview, trend, distribution, analytics, share, and dashboard requests should prefer `ChartBlockModel`
- KPI, metric-card, summary, and overview requests that are mainly numeric should prefer `GridCardBlockModel`
- interactive, linked, guided, narrative, and custom requests should let `JSBlockModel` be an insight peer instead of a last-resort extension
- `ChartBlockModel` defaults to `builder + basic`
- only upgrade chart strategy when the user explicitly asks for `sql` or `custom option / events`
- scenario and layout candidates should emit `visualizationSpec[]`, `creativeIntent`, `selectedInsightStrategy`, and `jsExpansionHints`

## Output focus

Keep at least:

- `scenarioId`
- `domainId` and `domainLabel`
- `archetypeId` and `archetypeLabel`
- `creativeIntent`
- `selectedInsightStrategy`
- `jsExpansionHints`
- `selectionRationale`
- `availableUses`
- `selectedUses`
- `generatedCoverage`
- `randomPolicy`
- `instanceInventory`

These fields are written into `compileArtifact.json` and are consumed directly by `nocobase-ui-validation-review`.

## Randomization

- default `mode=high-variance`
- use a runtime random seed when no explicit seed is provided
- use a fixed seed only when reproducibility is required
- randomness should vary layouts inside the same business intent, not ignore the business intent itself
