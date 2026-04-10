---
name: nocobase-ui-builder
description: >-
  Use when the user wants to inspect, draft, create, modify, reorder, or
  delete NocoBase Modern page (v2) menus, pages, tabs, popups, layouts, and
  block / field / action configuration, including template reuse through
  flow-surfaces APIs and turning high-level page intent or existing-surface
  structural edits into blueprint / patch DSL executed through
  validateDsl / executeDsl; does not handle ACL, data modeling, workflow
  orchestration, browser reproduction, page error postmortems, or
  non-Modern-page navigation.
---

# Start Here

- Cross-topic source of truth: read [normative-contract.md](./references/normative-contract.md) first.
- Default execution entry: read [execution-checklist.md](./references/execution-checklist.md) first.
- DSL shape and execution details live in [ui-dsl.md](./references/ui-dsl.md) and [dsl-execution.md](./references/dsl-execution.md).
- This file only keeps trigger boundaries, cross-topic hard rules, terminology, and the reference map.
- The live MCP schema, plus live `validateDsl` / `executeDsl` / `describeSurface` / `get` / `catalog` / `context` / `readback`, always take precedence over local documents.

## Operating Model

- `agents/openai.yaml` only handles skill invocation and minimal guardrails. It does not duplicate detailed rules.
- `SKILL.md` maintains trigger boundaries, scope, cross-topic hard rules, and the reference map.
- [normative-contract.md](./references/normative-contract.md) is the single source of truth for DSL-first drafting/execution, confirmation threshold, `catalog`, popup shell fallback, and schema drift / recovery.
- [execution-checklist.md](./references/execution-checklist.md) is the default execution entry and owns intent selection, read/write path choice, and fallback gating.
- [ui-dsl.md](./references/ui-dsl.md) defines the stable skill-side DSL contract for both `kind = "blueprint"` and `kind = "patch"`.
- [dsl-execution.md](./references/dsl-execution.md) is the decision-complete contract for `validateDsl -> executeDsl`, including when to show a DSL draft first and when low-level fallback is allowed.
- Each `references/*.md` file owns its topic-specific contract. If its granularity differs from the overview here, follow the topic reference and the live MCP schema.

## Scope & Handoff

- Only handle `group / flowPage / page / tab / popup / content` surfaces that are directly related to Modern page (v2), plus block / field / action / layout / configuration inside content areas.
- Do not handle non-Modern-page desktop routes, other workbench navigation structures, browser validation-case reproduction, page error postmortems, or workflow / ACL / data-modeling details.
- Explicit handoff:
  - ACL / route permissions / role permissions -> `nocobase-acl-manage`
  - collection / association / field schema authoring -> `nocobase-data-modeling`
  - consuming existing schema for blueprint / patch DSL authoring and UI resource binding -> stays in this skill
  - workflow create / update / revision / execution path -> `nocobase-workflow-manage`

## Key Terms

- `target family`: the surface family that the current target belongs to. Always use `menu-group`, `menu-item`, `page`, `outer-tab`, `route-content`, `popup-page`, `popup-tab`, `popup-content`, or `node`.
- `pre-init ids`: page / tab / route-related ids returned by `createMenu(type="item")` before `createPage(menuRouteId=...)` finishes initialization. They are not write-ready targets for the page/tab lifecycle yet.
- `initialized page`: a page that has already gone through `createPage(menuRouteId=...)` and can continue using page/tab lifecycle APIs.
- `dsl draft`: the structured intermediate artifact shown to the user when the request is still ambiguous, high-impact, or complex enough that direct execution would be risky.
- `blueprint DSL`: `kind = "blueprint"`, used for whole-page creation or update requests.
- `patch DSL`: `kind = "patch"`, used for precise existing-surface structural edits.
- `page archetype`: one of `management`, `detail`, `dashboard`, `portal`, or `custom`, used to choose the default page pattern while authoring blueprint DSL.
- `data-bound block`: a block whose semantics depend on a real data source, such as `table`, `details`, `createForm`, `editForm`, `filterForm`, many `chart`s, or other blocks whose live capability requires binding.
- `non-data block`: a block that may exist without binding a collection, such as `markdown`, `iframe`, `actionPanel`, or `jsBlock`.
- `readback`: the minimum necessary read after a write, used to confirm that structure, route state, popup subtree, or configuration was actually persisted.

## Cross-cutting Guardrails

1. `inspect` and DSL drafting are read-only by default. Only enter a write flow when the user explicitly asks to create, modify, reorder, delete, or fix something, or when a previously shown DSL draft has already been confirmed.
2. UI structure mutation must go through `flow_surfaces_*` only. Read-only collection-schema discovery is additionally allowed during DSL authoring and field pre-write verification when field truth or addability matters. Follow a strict fact priority: use `collections:list` only to narrow collection candidates; use `collections:get(appends=["fields"])` as the default schema truth for real field coverage, `interface`, and relation metadata (including relation fields); and use `flow_surfaces_catalog({ target, sections: ["fields"] })` when the question is whether the current target/container can actually add that field. Do not use those reads to author schema, and do not substitute UI mutation with `resource_*`, `workflows_*`, `flow_nodes_*`, `roles_*`, or low-level route-record writes.
3. High-level page-building requests such as "build a user management page" must first become `blueprint DSL`, even when the page includes nested popups, association bindings, same-row layouts, or field `clickToOpen/openView`. Existing-surface structural edits must first become `patch DSL` when the operation is covered.
4. Do not invent fields, bindings, or popup content. Every `data-bound block` in DSL must point to a real collection / association / live binding fact through `dataSources` and `dataSourceKey`. `non-data block`s may omit a data source.
5. Always emit explicit `dsl.kind` and `dsl.version`. Keep `assumptions` visible, and keep `unresolvedQuestions` honest. `executeDsl` is only allowed when `unresolvedQuestions` is empty.
6. Confirmation is risk-based: if the request is complex, ambiguous, destructive, or still depends on unresolved choices, show a DSL draft first. If the request is clear, bounded, and `unresolvedQuestions` is empty, direct execution is allowed.
7. Before any write, MCP must be reachable and authenticated. If MCP is unavailable, unauthenticated, the schema is stale, or the live environment lacks a required tool / capability / guard, stop guessing writes. For recovery, follow the `Schema Drift / Recovery Contract` in [normative-contract.md](./references/normative-contract.md).
8. `desktop_routes_list_accessible(tree=true)` only represents the menu tree visible to the current role. It is not the full system menu truth. Do not infer "does not exist in the system" from "not visible here".
9. Do not guess when the target is not unique. A menu title only accepts a uniquely matched `group`. If the target can only be inferred from sibling-relative position, narrow it to a unique target first. After `createMenu(type="item")`, you must run `createPage(menuRouteId=...)` before anything else. Its `pre-init ids` are not write-ready targets for the page/tab lifecycle.
10. The structural write path is `must-attempt-DSL-first`: new pages should first use `blueprint DSL -> validateDsl -> executeDsl -> readback`, and existing-surface supported edits should first use `describeSurface -> patch DSL -> validateDsl -> executeDsl -> readback`. Complexity, missing local examples, or low subjective confidence are not valid reasons to skip DSL. Only fall back to direct lifecycle / low-level APIs such as `createPage`, `compose`, `add*`, `configure`, or `setLayout` after `validateDsl` returns concrete unsupported / schema / contract evidence that proves the change is outside current DSL coverage, or when the work is a lifecycle-only exception such as isolated menu-group / menu move / template-record management.
11. If any child item in a batch write fails, stop immediately and report successes and failures separately. Do not auto-rollback, and do not continue with downstream writes that depend on "all succeeded". If a server contract / validation error points to drift or a capability gap, close the loop through [normative-contract.md](./references/normative-contract.md).
12. Any JS write must pass the local validator gate first. If the validator cannot run, the Node version is unsupported, or the result is not decidable, stop. Do not bypass the validator and call MCP directly.

## Reference Map

- [normative-contract.md](./references/normative-contract.md): the single source of truth for DSL-first drafting/execution, confirmation threshold, `catalog`, popup shell fallback, and schema drift / recovery.
- [execution-checklist.md](./references/execution-checklist.md): the default execution entry; covers preflight, intent, read/write path, risk gate, topic gate, and stop/handoff.
- [dsl-execution.md](./references/dsl-execution.md): the default structural execution contract for `validateDsl -> executeDsl`, including fallback rules.
- [ui-dsl.md](./references/ui-dsl.md): the stable DSL structure used to present or execute page intent and existing-surface edits.
- [verification.md](./references/verification.md): acceptance rules for `inspect`, DSL drafts, post-write `readback`, and batch / high-impact / destructive paths.
- [runtime-playbook.md](./references/runtime-playbook.md): the mental model for `target family`, locators, `pre-init ids`, write targets, and lifecycle flow.
- [page-intent-blueprint.md](./references/page-intent-blueprint.md): the blueprint-DSL authoring path for high-level page requests, including live schema discovery and confirmation rules.
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
