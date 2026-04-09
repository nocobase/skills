# Page Intent Planning

Read this file for high-level page-building requests such as "build a user management page", "design an order detail page", or "create a dashboard". This is the blueprint-first path. Do not use it for low-level patch requests on an already-identified block / field / action.

## 1. Default Rule

- High-level page-building requests must stop at a read-only `pageBlueprint` first.
- Do not write any UI structure before the user confirms the blueprint.
- Follow the `Blueprint-First Contract` in [normative-contract.md](./normative-contract.md).

## 2. Planning Inputs

Gather only live facts that are necessary to turn user intent into a page structure:

- existing menu/page context, when the request is updating an existing page
- real collection candidates
- real field lists on the collections that may appear on the page
- real association facts when the page may need association display or association popups
- live `catalog` facts when block capability or resource binding is uncertain

Allowed discovery stays read-only:

- `desktop_routes_list_accessible(tree=true)`
- `flow_surfaces_describe_surface`
- `flow_surfaces_get`, `flow_surfaces_catalog`, `flow_surfaces_context`
- read-only collection/schema discovery such as `collections:list`, `collections:get`, and `collections/{collectionName}/fields:list`

## 3. Planning Flow

1. Decide whether this is actually a page-building request.
2. Choose a `page archetype` through [page-archetypes.md](./page-archetypes.md).
3. Identify the real data sources that the page may need.
4. Choose blocks from the archetype pattern.
5. Fill each block with real fields / actions / popup semantics.
6. Add explicit `interactions` whenever cross-block binding should not be guessed later, especially `filterForm -> target block` cases.
7. Output a `pageBlueprint` through [page-blueprint-dsl.md](./page-blueprint-dsl.md).
8. Stop for confirmation.
9. After confirmation, hand the blueprint to [planning-compiler.md](./planning-compiler.md), compile it into `plan.steps[]`, and then prefer `validatePlan` / `executePlan` for execution.

## 4. Data-Source Rules

- `data-bound block`s must use real collection / association / live binding facts.
- Prefer reusable `dataSources[*].key` entries and let blocks refer to them through `dataSourceKey`.
- If popup content depends on live popup bindings such as `currentRecord` or `associatedRecords`, capture that as a popup-scoped data source in `dataSources` rather than leaving it implicit.
- `non-data block`s may omit `dataSourceKey`.
- Do not invent fields.
- If the user asks for a field that does not exist, call that out explicitly in the blueprint instead of silently substituting another field.
- Multi-collection pages are allowed. Each `data-bound block` must keep its own data-source boundary explicit.

## 5. Collection Resolution Heuristics

- If one collection clearly matches the page intent, use it as the primary source.
- If the intent clearly spans multiple business objects, produce a multi-source blueprint instead of forcing everything into one primary collection.
- If multiple collection candidates are plausible but the page semantics still depend on choosing one, surface the ambiguity in `assumptions` or `unresolvedQuestions` instead of guessing.

## 6. Field Selection Heuristics

- Prefer readable identifier fields first, such as title/name/code/username/nickname, when they exist.
- Prefer status/time fields when the page needs filtering, sorting, or auditing.
- Prefer association leaf fields for display intent, such as `department.name` instead of a raw association id.
- For forms, prefer fields that are actually writable in the business flow. Do not mirror every schema field into create/edit forms by default.
- For dashboards, do not invent KPI fields or fake aggregates. Only plan blocks that can be backed by live facts.
- For multi-target `filterForm` planning, do not leave target binding implicit. Express it in `interactions`.

## 7. Confirmation Output

Present the planning result in two parts:

1. a short natural-language explanation of the page structure and assumptions
2. a structured `pageBlueprint`

Do not mix execution logs into the blueprint response. The planning result is not a write result.
