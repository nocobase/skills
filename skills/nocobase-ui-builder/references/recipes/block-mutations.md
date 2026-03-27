# Block mutation recipe

## Read first

- [../page-first-planning.md](../page-first-planning.md)
- [../ui-api-overview.md](../ui-api-overview.md)
- [../patterns/payload-guard.md](../patterns/payload-guard.md)
- [../flow-schemas/index.md](../flow-schemas/index.md)

## Default steps

1. Run `start-run`
2. Read the local graph first; only add `PostFlowmodels_schemabundle` or `PostFlowmodels_schemas` when the graph is not enough
3. Read one live snapshot for the target page, tab, grid, or slot before writing
4. Assemble the draft payload
5. Perform the write through MCP and collect write/readback artifacts
6. Hand the draft payload, metadata, readback target, and artifacts to `ui_write_wrapper.mjs`
7. Only use `PostFlowmodels_move` or `PostFlowmodels_destroy` directly for ordering or delete operations not covered by the wrapper

## Key rules

- patch locally by default; do not rebuild the whole page tree for a local change
- do not continue without guard success or a structured `risk_accept` plus re-audit
- `save` or `mutate` returning `ok` is not final success; readback wins
- automatic reconciliation depends on both `args.targetSignature` and `result.summary`

## Drill deeper

- block details: [../blocks/index.md](../blocks/index.md)
- popup, relation, tree, or many-to-many details: [../patterns/index.md](../patterns/index.md)
- JS and RunJS: [../js-models/index.md](../js-models/index.md)
