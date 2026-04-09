---
name: nocobase-ui-builder
description: >-
  Use when the user wants to inspect, plan, create, modify, reorder, or delete
  NocoBase Modern page (v2) menus, pages, tabs, popups, layouts, and block /
  field / action configuration, including block / fields / popup template reuse
  through flow-surfaces APIs and turning high-level page intent into a
  confirmed page blueprint before building; does not handle ACL, data modeling,
  workflow orchestration, browser reproduction, page error postmortems, or
  non-Modern-page navigation.
---

# Start Here

- Cross-topic source of truth: read [normative-contract.md](./references/normative-contract.md) first.
- Default execution entry: read [execution-checklist.md](./references/execution-checklist.md) first.
- This file only keeps trigger boundaries, cross-topic hard rules, terminology, and the reference map.
- The live MCP schema, plus live `describeSurface` / `validatePlan` / `executePlan` / `get` / `catalog` / `context` / `readback`, always take precedence over local documents.

## Operating Model

- `agents/openai.yaml` only handles skill invocation and minimal guardrails. It does not duplicate detailed rules.
- `SKILL.md` maintains trigger boundaries, scope, cross-topic hard rules, and the reference map.
- [normative-contract.md](./references/normative-contract.md) is the single source of truth for blueprint-first planning, high-level execution entry, `catalog`, popup shell fallback, and schema drift / recovery.
- [execution-checklist.md](./references/execution-checklist.md) is the default execution entry and owns execution-path selection. Confirmed structural edits should default to backend planning execution before low-level fallback.
- [planning-compiler.md](./references/planning-compiler.md) is the decision-complete compiler contract for confirmed structure changes, including blueprint-node-to-step mapping, compilation order, step-id policy, selector policy, popup compilation semantics, and the coverage / fallback rules.
- [page-intent-planning.md](./references/page-intent-planning.md) owns the blueprint-first planning path for high-level page-building requests.
- [page-blueprint-dsl.md](./references/page-blueprint-dsl.md) defines the stable `pageBlueprint` output contract used between planning and execution.
- Each `references/*.md` file owns its topic-specific contract. If its granularity differs from the overview here, follow the topic reference and the live MCP schema.

## Scope & Handoff

- Only handle `group / flowPage / page / tab / popup / content` surfaces that are directly related to Modern page (v2), plus block / field / action / layout / configuration inside content areas.
- Do not handle non-Modern-page desktop routes, other workbench navigation structures, browser validation-case reproduction, page error postmortems, or workflow / ACL / data-modeling details.
- Explicit handoff:
  - ACL / route permissions / role permissions -> `nocobase-acl-manage`
  - collection / association / field schema authoring -> `nocobase-data-modeling`
  - consuming existing schema for page-blueprint planning and UI resource binding -> stays in this skill
  - workflow create / update / revision / execution path -> `nocobase-workflow-manage`

## Key Terms

- `target family`: the surface family that the current target belongs to. Always use `menu-group`, `menu-item`, `page`, `outer-tab`, `route-content`, `popup-page`, `popup-tab`, `popup-content`, or `node`.
- `pre-init ids`: page / tab / route-related ids returned by `createMenu(type="item")` before `createPage(menuRouteId=...)` finishes initialization. They are not write-ready targets for the page/tab lifecycle yet.
- `initialized page`: a page that has already gone through `createPage(menuRouteId=...)` and can continue using page/tab lifecycle APIs.
- `page blueprint`: a read-only plan artifact that translates a high-level page request into explicit layout / block / field / action / popup structure before any UI write happens.
- `surface plan`: a backend-executed `plan.steps[]` payload validated through `validatePlan` and executed through `executePlan`.
- `bootstrap plan`: a `surface plan` with no existing surface, typically used for `createMenu` / `createPage` chains.
- `page archetype`: one of `management`, `detail`, `dashboard`, `portal`, or `custom`, used to choose the default planning pattern.
- `data-bound block`: a block whose semantics depend on a real data source, such as `table`, `details`, `createForm`, `editForm`, `filterForm`, many `chart`s, or other blocks whose live capability requires binding.
- `non-data block`: a block that may exist without binding a collection, such as `markdown`, `iframe`, `actionPanel`, or `jsBlock`.
- `readback`: the minimum necessary read after a write, used to confirm that structure, route state, popup subtree, or configuration was actually persisted.

## Cross-cutting Guardrails

1. `inspect` and `page blueprint` planning are read-only by default. Only enter a write flow when the user explicitly asks for a low-level mutation, or when the user has already confirmed a previously shown page blueprint.
2. UI structure mutation must go through `flow_surfaces_*` only. Read-only collection-schema discovery is additionally allowed during page-blueprint planning through live collection reads such as `collections:list`, `collections:get`, and `collections/{collectionName}/fields:list`. Do not use those reads to author schema, and do not substitute UI mutation with `resource_*`, `workflows_*`, `flow_nodes_*`, `roles_*`, or low-level route-record writes.
3. High-level page-building requests such as "build a user management page" default to `blueprint-first`: discover real schema, produce a confirmed `pageBlueprint`, and only then build the page.
4. Do not invent fields, bindings, or popup content. Every `data-bound block` in a page blueprint must point to a real collection / association / live binding fact through `dataSources` and `dataSourceKey`. `non-data block`s may omit a data source.
5. Before any write, MCP must be reachable and authenticated. If MCP is unavailable, unauthenticated, the schema is stale, or the live environment lacks a required tool / capability / guard, stop guessing writes. For recovery, follow the `Schema Drift / Recovery Contract` in [normative-contract.md](./references/normative-contract.md).
6. `desktop_routes_list_accessible(tree=true)` only represents the menu tree visible to the current role. It is not the full system menu truth. Do not infer "does not exist in the system" from "not visible here".
7. Do not guess when the target is not unique. A menu title only accepts a uniquely matched `group`. If the target can only be inferred from sibling-relative position, narrow it to a unique target first. After `createMenu(type="item")`, you must run `createPage(menuRouteId=...)` before anything else. Its `pre-init ids` are not write-ready targets for the page/tab lifecycle.
8. The default write path is high-level first: existing-surface structural edits should prefer `describeSurface -> validatePlan -> executePlan -> readback`, and bootstrap page/menu creation should prefer bootstrap `validatePlan -> executePlan`. Confirmed structure changes should compile into `plan.steps[]` first. Only fall back to `get -> [decide whether to append catalog by normative contract] -> write -> readback` when the high-level plan path cannot express the change, or when the user explicitly asks for low-level control.
9. If any child item in a batch write fails, stop immediately and report successes and failures separately. Do not auto-rollback, and do not continue with downstream writes that depend on "all succeeded". If a server contract / validation error points to drift or a capability gap, close the loop through [normative-contract.md](./references/normative-contract.md). Do not define an abstract refresh-retry loop.
10. Any JS write must pass the local validator gate first. If the validator cannot run, the Node version is unsupported, or the result is not decidable, stop. Do not bypass the validator and call MCP directly.

## Reference Map

- [normative-contract.md](./references/normative-contract.md): the single source of truth for blueprint-first planning, high-level execution entry, `catalog`, popup shell fallback, and schema drift / recovery.
- [execution-checklist.md](./references/execution-checklist.md): the default execution entry; covers preflight, intent, read/write path, risk gate, topic gate, and stop/handoff.
- [planning-compiler.md](./references/planning-compiler.md): the decision-complete compiler contract for confirmed structural intent, including `pageBlueprint -> plan.steps[]`, compilation order, step-id policy, selector policy, popup compilation semantics, and the coverage / fallback rules.
- [verification.md](./references/verification.md): acceptance rules for `inspect`, post-write `readback`, and batch / high-impact / destructive paths.
- [runtime-playbook.md](./references/runtime-playbook.md): the mental model for `target family`, locators, `pre-init ids`, write targets, and lifecycle flow.
- [page-intent-planning.md](./references/page-intent-planning.md): the blueprint-first path for high-level page requests, including live schema discovery and confirmation rules.
- [page-blueprint-dsl.md](./references/page-blueprint-dsl.md): the stable `pageBlueprint` structure used to present a page plan before execution.
- [page-archetypes.md](./references/page-archetypes.md): archetype defaults for management, detail, dashboard, portal, and custom pages.
- [capabilities.md](./references/capabilities.md): how to choose blocks / forms / actions / fields, plus the default design for display vs association fields.
- [settings.md](./references/settings.md): the sole decision rules for `add* + settings`, `configure`, and `updateSettings`.
- [tool-shapes.md](./references/tool-shapes.md): flow-surfaces request envelopes, minimal legal payload shapes, and common invalid request patterns.
- [templates.md](./references/templates.md): when and how to save, search, apply, detach, and verify reusable block / fields / popup templates.
- [popup.md](./references/popup.md): rules for `currentRecord`, association popups, `associatedRecords`, `openView`, and popup openers.
- [chart.md](./references/chart.md): the chart topic entry point and routing guidance.
- [chart-core.md](./references/chart-core.md): the main chart runtime path for setup, reconfiguration, context narrowing, and readback.
- [chart-validation.md](./references/chart-validation.md): chart contract cases, negative cases, and regression matrices.
- [js.md](./references/js.md): the RunJS validator gate, model mapping, context semantics, and code style.
- [runjs-runtime.md](./references/runjs-runtime.md): the RunJS CLI entry, cwd assumptions, runtime-local dev commands, and `--skill-mode` constraints.
- [aliases.md](./references/aliases.md): how to narrow high-ambiguity natural-language expressions to object semantics or capabilities first.
