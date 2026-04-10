# Page Intent Blueprint

Read this file for high-level page-building requests such as "build a user management page", "design an order detail page", or "create a dashboard". This is the blueprint-DSL authoring path. Do not use it for low-level patch requests on an already-identified block / field / action.

## 1. Default Rule

- High-level page-building requests should first become `kind = "blueprint"` DSL.
- Per [normative-contract.md](./normative-contract.md), nested popups, popup-scoped bindings such as `currentRecord` / `associatedRecords`, same-row layouts, and field `clickToOpen/openView` still stay on the blueprint path first.
- If the request is complex, ambiguous, or high-impact, stop at a read-only DSL draft first.
- If the request is clear, bounded, and the DSL has empty `unresolvedQuestions`, direct execution is allowed.
- Follow the `DSL-First Contract` in [normative-contract.md](./normative-contract.md).

## 2. Blueprint Inputs

Gather only live facts that are necessary to turn user intent into page structure:

- existing menu/page context, when the request is updating an existing page
- real collection candidates
- real field lists on the collections that may appear on the page
- real association facts when the page may need association display or association popups
- live `catalog` facts when block capability or resource binding is uncertain

Use the collection discovery priority below:

- `collections:list` narrows collection candidates.
- `collections:get(appends=["fields"])` is the default field truth during blueprint authoring. Use it to confirm scalar fields, relation fields, `interface`, and association metadata that the DSL depends on.
- If the authoring question is target-specific addability rather than schema existence, read `flow_surfaces_catalog({ target, sections: ["fields"] })`.

Allowed discovery stays read-only:

- `desktop_routes_list_accessible(tree=true)`
- `flow_surfaces_describe_surface`
- `flow_surfaces_get`, `flow_surfaces_catalog`, `flow_surfaces_context`
- read-only collection/schema discovery such as `collections:list` and `collections:get`

## 3. Blueprint Flow

1. Decide whether this is actually a page-building request.
2. Choose a `page archetype` through [page-archetypes.md](./page-archetypes.md).
3. Identify the real data sources that the page may need.
4. Follow the collection discovery priority above to confirm the real collections, fields, and target-specific addability facts the page will rely on.
5. Choose blocks from the archetype pattern.
6. Fill each block with real fields / actions / popup semantics.
7. Add explicit `interactions` whenever cross-block binding should not be guessed later, especially `filterForm -> target block` cases.
8. Output blueprint DSL through [ui-dsl.md](./ui-dsl.md).
9. If `unresolvedQuestions` is non-empty or the request is high-risk, stop for confirmation.
10. If the request is clear and bounded, hand the DSL to [dsl-execution.md](./dsl-execution.md).

Do not switch to low-level page-building writes during blueprint authoring merely because the page is complex or because the local docs do not include the same scenario verbatim. Coverage still follows `validateDsl`.

## 4. Data-Source Rules

- `data-bound block`s must use real collection / association / live binding facts.
- Prefer reusable `dataSources[*].key` entries and let blocks refer to them through `dataSourceKey`.
- If popup content depends on live popup bindings such as `currentRecord` or `associatedRecords`, capture that as a popup-scoped data source in `dataSources` rather than leaving it implicit.
- `non-data block`s may omit `dataSourceKey`.
- Do not invent fields.
- If the user asks for a field that does not exist, call that out explicitly in DSL instead of silently substituting another field.
- Multi-collection pages are allowed. Each `data-bound block` must keep its own data-source boundary explicit.

## 5. Collection Resolution Heuristics

- If one collection clearly matches the page intent, use it as the primary source.
- If the intent clearly spans multiple business objects, produce a multi-source DSL instead of forcing everything into one primary collection.
- If multiple collection candidates are plausible but the page semantics still depend on choosing one, surface the ambiguity in `assumptions` or `unresolvedQuestions` instead of guessing.

## 6. Field Selection Heuristics

- Prefer readable identifier fields first, such as title/name/code/username/nickname, when they exist.
- Prefer status/time fields when the page needs filtering, sorting, or auditing.
- Prefer association leaf fields for display intent, such as `department.name` instead of a raw association id.
- For forms, prefer fields that are actually writable in the business flow. Do not mirror every schema field into create/edit forms by default.
- For dashboards, do not invent KPI fields or fake aggregates. Only include blocks that can be backed by live facts.
- For multi-target `filterForm` authoring, do not leave target binding implicit. Express it in `interactions`.

## 7. Draft Output

Present the draft result in two parts:

1. a short natural-language explanation of the page structure and assumptions
2. a structured blueprint DSL document

Do not mix execution logs into the draft response. The draft result is not a write result.
