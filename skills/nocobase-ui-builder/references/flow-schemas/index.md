---
title: Flow Schema Graph index
description: Checked-in `flowModels:schemas` graph and ref reference for the current instance. Choose the `use` first, then read the model, slot catalog, and only the artifacts you need.
---

# Flow Schema Graph index

This directory stores the graph and reference view of the current instance's `flowModels:schemas` result. It no longer embeds the full recursive schema tree into a single file.

Directory structure:

- [manifest.json](manifest.json)
- `models/<UseName>.json`
- `catalogs/<OwnerUse>.<slot>.json`
- `artifacts/json-schema/<UseName>.<hash>.json`
- `artifacts/minimal-example/<UseName>.<hash>.json`
- `artifacts/skeleton/<UseName>.<hash>.json`
- `artifacts/examples/<UseName>.<hash>.json`

Snapshot notes:

- source: `flowModels:schemas`
- shape: `model + slot catalog + artifact`
- purpose: reduce `PostFlowmodels_schemas` traffic and let the agent follow refs on demand instead of loading the whole recursive tree

## Recommended usage

1. Open [manifest.json](manifest.json) first and confirm the target `use`
2. Read `models/<UseName>.json`
3. If you need to know which child models a slot accepts, read `catalogs/<OwnerUse>.<slot>.json`
4. Only open artifacts when you truly need JSON Schema, skeleton, or minimal-example details
5. If you need to hydrate a branch, prefer `scripts/flow_schema_graph.mjs hydrate-branch`

## Hard rules

- do not expand the entire `artifacts/json-schema/` tree at once
- in one round, read only 1 to 2 model files plus the necessary 1 to 2 catalogs or artifacts
- `PostFlowmodels_schemabundle` is still used for runtime root-block discovery; the local graph mainly replaces routine `flowModels:schemas` browsing
- `materialize-use` and `hydrate-branch` output graph-composed views, not byte-for-byte copies of the old raw snapshot

## Common entry `use` values

- `BlockGridModel`
- `PageModel`
- `RootPageModel`
- `RootPageTabModel`
- `PageTabModel`
- `FilterFormBlockModel`
- `TableBlockModel`
- `DetailsBlockModel`
- `CreateFormModel`
- `EditFormModel`
- `ActionModel`
- `JSBlockModel`
- `JSColumnModel`
- `JSFieldModel`
- `JSItemModel`
- `JSActionModel`

For the full list, use [manifest.json](manifest.json).
