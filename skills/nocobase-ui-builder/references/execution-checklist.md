# Execution Checklist

Use this checklist by default during execution. Only open a topic reference when a specific contract is actually hit. For cross-topic rules around DSL-first drafting/execution, `catalog`, popup shell fallback, and schema drift / recovery, see [normative-contract.md](./normative-contract.md).

## 1. Preflight

- Before any write, confirm that the NocoBase MCP is reachable, authenticated, and the schema is usable.
- Before any structural write, decide the DSL path first and plan to attempt `validateDsl` before any low-level page-building write. Do not treat complexity or missing local examples as a DSL exclusion signal.
- `inspect` and DSL drafting are read-only by default. Only enter a write flow when the user explicitly asks to create, modify, reorder, delete, or fix something, or when a previously shown DSL draft has already been confirmed.
- If the live environment already shows an auth error, a missing critical tool, a stale schema, or a capability gap, stop writing first. For recovery, see [normative-contract.md](./normative-contract.md).

## 2. Choose Intent

- First decide the primary intent: `inspect`, `draft-blueprint-dsl`, `execute-blueprint-dsl`, `execute-patch-dsl`, `create-menu-group`, `move-menu`, `reorder`, or `delete-ui`.
- Only add a topic gate when the task truly hits `popup`, `chart`, or `js`.
- If the request mentions template reuse, save-as-template, copy/reference mode, convert-to-copy, or template search/selection, read [templates.md](./templates.md) before choosing the write path.
- If the request involves `title` / `icon`, first identify whether it means the menu entry, the page header title, the page header icon, or a tab / popup tab. Do not jump straight to a lifecycle API just because you already have a page/tab locator.

Default path quick reference:

| intent | Default primary path | Minimum readback |
| --- | --- | --- |
| `inspect` | For menu titles, read the menu tree first. For initialized surfaces, start with `get`; only switch to `describeSurface` when the next step is existing-surface DSL execution. Decide whether to append `catalog` via [normative-contract.md](./normative-contract.md). | `Inspect` in [verification.md](./verification.md) |
| `draft-blueprint-dsl` | Read [page-intent-blueprint.md](./page-intent-blueprint.md). Discover real schema facts, produce a blueprint DSL draft, and stop for confirmation. | read-only facts only; no write readback |
| `execute-blueprint-dsl` | Author blueprint DSL through [page-intent-blueprint.md](./page-intent-blueprint.md) + [ui-dsl.md](./ui-dsl.md), then follow [dsl-execution.md](./dsl-execution.md). | `executeDsl` readback in [verification.md](./verification.md) |
| `execute-patch-dsl` | Read `get` / `describeSurface`, author patch DSL through [ui-dsl.md](./ui-dsl.md), then follow [dsl-execution.md](./dsl-execution.md). | `executeDsl` readback in [verification.md](./verification.md) |
| `create-menu-group` | Use direct `createMenu(type="group")`. This is outside current DSL coverage unless the group is just a parent inside a full-page DSL. | return value; menu tree if needed |
| `move-menu` | If `menuRouteId` is already known, call `updateMenu(parentMenuRouteId=...)` directly. If you only have a menu title, read the menu tree first. | menu tree |
| `reorder` | Prefer patch DSL for supported tab/node reorder cases; otherwise narrow sibling / target via `get`, then use `moveTab`, `movePopupTab`, or `moveNode`. | parent, page, or route/tree |
| `delete-ui` | Prefer patch DSL for `page.destroy`, `tab.remove`, and `node.remove` when covered; otherwise use the corresponding lifecycle delete after `get` / menu tree makes blast radius explicit. | destructive / high-impact readback |

## 3. High-Level Page Path (`draft-blueprint-dsl` / `execute-blueprint-dsl`)

- Read [page-intent-blueprint.md](./page-intent-blueprint.md) first for any high-level page-building request.
- Nested popups, `currentRecord`, `associatedRecords`, same-row layouts, and field `clickToOpen/openView` still belong to blueprint authoring first. Do not skip blueprint DSL just because the page is complex.
- Use read-only schema discovery to identify real collections, fields, and associations. The allowed blueprint-authoring schema sources are the live read APIs described by the `DSL-First Contract` in [normative-contract.md](./normative-contract.md).
- During blueprint authoring, use collection discovery in this order: `collections:list` to narrow candidates, `collections:get(appends=["fields"])` as the default schema truth for real fields / `interface` / relation metadata, and `flow_surfaces_catalog({ target, sections: ["fields"] })` only when target-specific field addability is the question.
- Choose a `page archetype`, then build blueprint DSL through [page-archetypes.md](./page-archetypes.md) and [ui-dsl.md](./ui-dsl.md).
- Distinguish `data-bound block`s from `non-data block`s:
  - `data-bound block`s need an explicit real data source.
  - `non-data block`s may omit `dataSourceKey`.
- Use `dataSources` to keep collection facts, association-path facts, and popup-scoped live bindings such as `currentRecord` or `associatedRecords` explicit. Do not write raw low-level `resource` objects into the DSL layer.
- If the blueprint targets an existing page, require a real target locator in `target.locator` before the DSL can claim `update-page`.
- If the DSL includes popup semantics, make `popups[*].completion` explicit. Do not leave execution to guess whether a popup is `shell-only` or `completed`.
- Do not invent missing fields. If the requested page depends on schema that does not exist, surface that gap in DSL and stop before writes.
- If the request is complex, ambiguous, destructive, or still depends on non-empty `unresolvedQuestions`, present the result as: human-readable explanation first, then a structured DSL draft, and stop for confirmation.
- If the request is clear, bounded, and `unresolvedQuestions` is empty, you may continue directly into [dsl-execution.md](./dsl-execution.md).

## 4. Existing-Surface Structural Edit Path (`execute-patch-dsl`)

- Use `get` to narrow family / target / local structure. Switch to `describeSurface` when the next step is structural execution and you need `fingerprint`, surface anchoring, or stable refs.
- Author `kind = "patch"` DSL through [ui-dsl.md](./ui-dsl.md). Keep `target.locator` explicit, and use stable ids or locators for each change target/source.
- If you need stable names for already existing nodes, bind them through `describeSurface.bindRefs` and reuse those ids in patch DSL. Do not expose ref persistence internals in user-facing commentary.
- If the change is still a page / block / field / action / popup / layout edit, do not downgrade to low-level writes merely because the edit looks complex. Let `validateDsl` determine whether coverage is sufficient.
- If the desired edit is outside patch coverage, do not force it into DSL. Use the low-level fallback allowed by [dsl-execution.md](./dsl-execution.md).

## 5. Resolve Visible Slot (`title` / `icon` only)

- When the natural language uses frequent terms like `page title`, `menu title`, `tab title`, `icon`, or `small icon`, first resolve which visible slot the user actually means: the left menu, the page content header, the outer tab, or the popup tab.
- Use the default guess order from [aliases.md](./aliases.md): look for position clues first, then object name, and only then the default entry semantics of a route-backed page.
- If the user only says `page title` / `page icon` with no position clue, default to the menu entry. Do not default directly to `updateTab`.
- If the final target is a default guess rather than an explicit user designation, state it in commentary before writing.
- If the semantics land on the page-header title, continue with page `configure`.
- If the semantics land on the page-header icon, first confirm that the current header actually consumes the relevant property. If there is no rendering path, do not market it as a menu icon or tab icon.

## 6. Read Path

- For localized inspection, low-level fallback writes, or direct readback, default to `get` first.
- For an existing surface, switch to `describeSurface` when the next step is DSL execution and you need `fingerprint`, existing refs, or a public-tree anchor.
- When you do call `catalog`, default to the smart response first. Do not add `sections/expand` unless the current decision truly needs a broader payload.
- For collection/field discovery outside blueprint authoring, keep the same fact priority: narrow with `collections:list`, confirm field truth through `collections:get(appends=["fields"])`, and only read `catalog({ target, sections: ["fields"] })` when current-target field addability is the question.
- For popup guard-sensitive scenarios, follow the `guard-first popup flow` in [popup.md](./popup.md). For the `addField/addFields` gate, see [capabilities.md](./capabilities.md).
- `inspect` is read-only. For request shapes of `describeSurface` / `get` / `catalog` / `context`, see [tool-shapes.md](./tool-shapes.md).

## 7. Write Path

- Default structural chain for a new page is `blueprint DSL -> validateDsl -> executeDsl -> readback`.
- Default structural chain for an existing surface is `describeSurface -> patch DSL (or update-page DSL) -> validateDsl -> executeDsl -> readback`.
- Use `verificationMode = "strict"` by default on `executeDsl`.
- Low-level fallback remains `get -> [append catalog if required by normative contract] -> write -> readback`, but only after a prior `validateDsl` failure has produced concrete fallback evidence, or when the task is a lifecycle-only exception outside DSL coverage.
- If the request came in as a high-level page-building request, do not enter low-level write mode until the blueprint DSL is either confirmed or clearly safe to execute directly under the confirmation threshold.
- If fallback happens after a DSL attempt, explain which `validateDsl` failed, the concrete error, and why it proves the current write cannot stay in DSL.
- Before any field-adding write path such as `compose(...fields)`, `addField`, or `addFields`, first confirm field truth through `collections:get(appends=["fields"])`, then confirm current-target addability through `catalog({ target, sections: ["fields"] })` when the container capability matters.
- For `title/icon` metadata changes: prefer `updateMenu` for the left menu entry; only use `updateTab` / `updatePopupTab` for explicit tab semantics; only use page `configure` for the page-header title; inspect the render chain first for the page-header icon and do not promise visible effect by default.
- If the write is high-impact or destructive, explain the blast radius before execution, even when the path is DSL-based.
- Any JS write still must pass the RunJS validator gate before it reaches MCP.

## 8. Stop / Handoff Conditions

- If page authoring proves that the requested fields, relations, or collections do not exist yet, stop the UI write path and hand off schema authoring to `nocobase-data-modeling`.
- If the required structure is not covered by DSL and low-level fallback would still require guessing, stop and ask for clarification instead of improvising.
- If the request is actually about ACL, workflows, non-Modern-page routing, or browser reproduction, hand off to the appropriate skill.
